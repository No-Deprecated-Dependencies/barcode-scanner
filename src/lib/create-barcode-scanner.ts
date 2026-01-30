import { createWatchable } from './create-watchable'
import { getCameraAccess, getScanArea, type ScanArea, translateAreaToVideoRender } from './utils'
import { decode, install } from './worker'

type State = {
    calcScanArea: (video: HTMLVideoElement) => ScanArea
    decodeFrameTs: number
    isDecodeFrameProcessed: boolean
    isDestroyed: boolean
    isVideoActive: boolean
    isVideoPaused: boolean
    scanArea: ScanArea
    scanRate: number
    video: HTMLVideoElement
    worker: null | Worker
}

async function createBarcodeScanner(
    video: HTMLVideoElement,
    {
        calcScanArea,
        debug,
        onDecodeFailure = () => {},
        onDecodeSuccess = () => {},
        setAreaDetectedVariables,
        setAreaPositionVariables,
    }: {
        calcScanArea?: (video: HTMLVideoElement) => ScanArea
        debug?: boolean
        onDecodeFailure?: () => void
        onDecodeSuccess?: (data: string, area: ScanArea) => void
        setAreaDetectedVariables?: boolean
        setAreaPositionVariables?: boolean
    } = {},
) {
    if (!(video instanceof HTMLVideoElement)) {
        throw new Error('video is not a HTMLVideoElement')
    }

    if (!(onDecodeSuccess instanceof Function)) {
        throw new Error('onDecodeSuccess is not a function')
    }

    if (!(onDecodeFailure instanceof Function)) {
        throw new Error('onDecodeFailure is not a function')
    }

    const canvas = document.createElement('canvas')
    const canvasContext = canvas.getContext('2d', { willReadFrequently: true })!

    if (!canvasContext) {
        throw new Error('canvas context is not supported')
    }

    const { state } = createWatchable<State>({
        calcScanArea: calcScanArea ?? getScanArea,
        decodeFrameTs: performance.now(),
        isDecodeFrameProcessed: false,
        isDestroyed: false,
        isVideoActive: false,
        isVideoPaused: false,
        scanArea: getScanArea(video),
        scanRate: 24,
        video,
        worker: null,
    })

    const requestFrame = video.requestVideoFrameCallback?.bind(video) ?? requestAnimationFrame

    state.worker = await install()

    state.video.autoplay = true
    state.video.disablePictureInPicture = true
    state.video.hidden = false
    state.video.muted = true
    state.video.playsInline = true

    function handleDecode(
        onDecodeSuccess: (data: string, area: ScanArea) => void,
        onDecodeFailure: () => void,
    ) {
        if (state.isDestroyed || state.isVideoActive === false) {
            return
        }

        requestFrame(() => {
            if (
                // Skip if the time since the last request frame is less than the scan rate
                performance.now() - state.decodeFrameTs < 1000 / state.scanRate ||
                // Skip if the frame is already processed
                state.isDecodeFrameProcessed ||
                // Skip if the video is not ready
                state.video.readyState <= 1
            ) {
                handleDecode(onDecodeSuccess, onDecodeFailure)
                return
            }

            state.isDecodeFrameProcessed = true

            state.scanArea = state.calcScanArea(state.video)

            if (setAreaPositionVariables) {
                const renderArea = translateAreaToVideoRender(video, state.scanArea)
                video.parentElement?.style.setProperty(
                    '--barcode-scanner-area-height',
                    `${renderArea.height}px`,
                )
                video.parentElement?.style.setProperty(
                    '--barcode-scanner-area-width',
                    `${renderArea.width}px`,
                )
                video.parentElement?.style.setProperty(
                    '--barcode-scanner-area-x',
                    `${renderArea.x}px`,
                )
                video.parentElement?.style.setProperty(
                    '--barcode-scanner-area-y',
                    `${renderArea.y}px`,
                )
            }

            canvas.height = state.scanArea.height
            canvas.width = state.scanArea.width
            canvasContext.clearRect(0, 0, canvas.width, canvas.height)
            canvasContext.drawImage(
                state.video,
                state.scanArea.x,
                state.scanArea.y,
                state.scanArea.width,
                state.scanArea.height,
                0,
                0,
                canvas.width,
                canvas.height,
            )

            const imageData = canvasContext.getImageData(0, 0, canvas.width, canvas.height)

            if (debug) {
                window.dispatchEvent(
                    new CustomEvent('barcode-scanner:decode-frame', {
                        detail: {
                            imageData,
                        },
                    }),
                )
            }

            decode(imageData)
                .then((data) => {
                    if (data) {
                        const cornerPointsX = data.cornerPoints.map((p) => p.x)
                        const cornerPointsY = data.cornerPoints.map((p) => p.y)
                        const area = {
                            height: Math.max(...cornerPointsY) - Math.min(...cornerPointsY),
                            width: Math.max(...cornerPointsX) - Math.min(...cornerPointsX),
                            x: Math.min(...cornerPointsX) + state.scanArea.x,
                            y: Math.min(...cornerPointsY) + state.scanArea.y,
                        }

                        if (setAreaDetectedVariables) {
                            const renderArea = translateAreaToVideoRender(video, area)
                            video.parentElement?.style.setProperty(
                                '--barcode-scanner-area-detected-height',
                                `${renderArea.height}px`,
                            )
                            video.parentElement?.style.setProperty(
                                '--barcode-scanner-area-detected-width',
                                `${renderArea.width}px`,
                            )
                            video.parentElement?.style.setProperty(
                                '--barcode-scanner-area-detected-x',
                                `${renderArea.x}px`,
                            )
                            video.parentElement?.style.setProperty(
                                '--barcode-scanner-area-detected-y',
                                `${renderArea.y}px`,
                            )
                        }

                        onDecodeSuccess(data.rawValue, area)
                    } else {
                        if (setAreaDetectedVariables) {
                            video.parentElement?.style.removeProperty(
                                '--barcode-scanner-area-detected-height',
                            )
                            video.parentElement?.style.removeProperty(
                                '--barcode-scanner-area-detected-width',
                            )
                            video.parentElement?.style.removeProperty(
                                '--barcode-scanner-area-detected-x',
                            )
                            video.parentElement?.style.removeProperty(
                                '--barcode-scanner-area-detected-y',
                            )
                        }

                        onDecodeFailure()
                    }
                })
                .catch(() => {
                    console.error('Failed to decode barcode')
                })
                .finally(() => {
                    state.decodeFrameTs = performance.now()
                    state.isDecodeFrameProcessed = false
                    handleDecode(onDecodeSuccess, onDecodeFailure)
                })
        })
    }

    async function destroy() {
        if (state.isDestroyed) {
            return
        }

        stop()

        state.worker?.terminate()
        state.worker = null
        state.isDestroyed = true
    }

    function pause() {
        state.video.pause()
        canvas.height = state.video.videoHeight
        canvas.width = state.video.videoWidth
        canvasContext.drawImage(
            state.video,
            0,
            0,
            canvas.width,
            canvas.height,
            0,
            0,
            canvas.width,
            canvas.height,
        )
        canvas.toBlob(
            (blob) => {
                if (blob) {
                    if (state.video.poster.startsWith('blob:')) {
                        URL.revokeObjectURL(state.video.poster)
                    }

                    state.video.poster = URL.createObjectURL(blob)
                }
            },
            'image/jpeg',
            0.9,
        )

        if (state.video.srcObject instanceof MediaStream) {
            state.video.srcObject.getTracks().forEach((track) => track.stop())
        }

        state.isVideoActive = false
        state.isVideoPaused = true
        state.video.srcObject = null
    }

    async function start({
        facingMode = 'environment',
        ...rest
    }: {
        facingMode?: 'environment' | 'user'
        onDecodeFailure?: () => void
        onDecodeSuccess?: (data: string, area: ScanArea) => void
    } = {}) {
        const hasAccess = await getCameraAccess()

        if (!hasAccess) {
            throw new Error('No camera access')
        }

        if (state.video.srcObject instanceof MediaStream) {
            return
        } else {
            state.video.srcObject = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode,
                },
            })

            await state.video.play()
        }

        state.isVideoActive = true
        state.isVideoPaused = false
        state.scanArea = state.calcScanArea(state.video)
        state.video.style.transform = facingMode === 'user' ? 'scaleX(-1)' : 'none'

        if (setAreaPositionVariables) {
            const renderArea = translateAreaToVideoRender(video, state.scanArea)
            video.parentElement?.style.setProperty(
                '--barcode-scanner-area-height',
                `${renderArea.height}px`,
            )
            video.parentElement?.style.setProperty(
                '--barcode-scanner-area-width',
                `${renderArea.width}px`,
            )
            video.parentElement?.style.setProperty('--barcode-scanner-area-x', `${renderArea.x}px`)
            video.parentElement?.style.setProperty('--barcode-scanner-area-y', `${renderArea.y}px`)
        }

        handleDecode(
            rest.onDecodeSuccess ?? onDecodeSuccess,
            rest.onDecodeFailure ?? onDecodeFailure,
        )
    }

    function stop() {
        if (state.video.srcObject instanceof MediaStream) {
            state.video.srcObject.getTracks().forEach((track) => track.stop())
        }

        if (state.video.poster.startsWith('blob:')) {
            URL.revokeObjectURL(state.video.poster)
        }

        state.isVideoActive = false
        state.isVideoPaused = false
        state.video.poster = ''
        state.video.srcObject = null
    }

    return {
        destroy,
        pause,
        start,
        state,
        stop,
    }
}

export { createBarcodeScanner }
