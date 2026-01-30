import { createWatchable } from './create-watchable'
import { getCameraAccess, getScanArea, type ScanArea, wait } from './utils'
import { decode, install } from './worker'

function createBarcodeScanner(
    video: HTMLVideoElement,
    {
        calcScanArea,
    }: {
        calcScanArea?: (video: HTMLVideoElement) => ScanArea
    } = {},
) {
    if (!(video instanceof HTMLVideoElement)) {
        throw new Error('video is not a HTMLVideoElement')
    }

    const canvas = document.createElement('canvas')
    const canvasContext = canvas.getContext('2d', { willReadFrequently: true })

    if (!canvasContext) {
        throw new Error('Failed to get canvas context')
    }

    const { state, watch } = createWatchable<{
        calcScanArea: (video: HTMLVideoElement) => ScanArea
        canvas: HTMLCanvasElement
        canvasContext: CanvasRenderingContext2D
        debug: boolean
        decodeFrameRequestTimestamp: number
        facingMode: 'environment' | 'user'
        isDecodeFrameProcessed: boolean
        isDestroyed: boolean
        isReady: boolean
        isVideoActive: boolean
        isVideoPaused: boolean
        onDecodeFailure: () => void
        onDecodeSuccess: (data: string, area: ScanArea) => void
        requestFrame: (callback: () => void) => number
        resumeOnVisibilityChange: boolean
        scanArea: ScanArea
        scanRate: number
        video: HTMLVideoElement
        worker: null | Worker
    }>({
        calcScanArea: calcScanArea ?? getScanArea,
        canvas,
        canvasContext,
        debug: true,
        decodeFrameRequestTimestamp: performance.now(),
        facingMode: 'environment',
        isDecodeFrameProcessed: false,
        isDestroyed: false,
        isReady: false,
        isVideoActive: false,
        isVideoPaused: false,
        onDecodeFailure: () => {},
        onDecodeSuccess: () => {},
        requestFrame: video.requestVideoFrameCallback
            ? video.requestVideoFrameCallback.bind(video)
            : requestAnimationFrame,
        resumeOnVisibilityChange: false,
        scanArea: {
            height: 0,
            width: 0,
            x: 0,
            y: 0,
        },
        scanRate: 24,
        video,
        worker: null,
    })

    install()
        .then((worker) => (state.worker = worker))
        .then(() => (import.meta.env.DEV ? wait(3000) : Promise.resolve()))
        .then(() => (state.isReady = true))

    state.video.autoplay = true
    state.video.disablePictureInPicture = true
    state.video.hidden = false
    state.video.muted = true
    state.video.playsInline = true

    document.addEventListener('visibilitychange', handleVisibilityChange)

    function handleVisibilityChange() {
        if (document.visibilityState === 'hidden') {
            if (state.isVideoActive && state.isVideoPaused === false) {
                state.resumeOnVisibilityChange = true

                pause()
            }
        } else {
            if (state.resumeOnVisibilityChange) {
                state.resumeOnVisibilityChange = false

                start(
                    {
                        facingMode: state.facingMode,
                    },
                    state.onDecodeSuccess,
                    state.onDecodeFailure,
                )
            }
        }
    }

    function handleDecode(
        onDecodeSuccess: (data: string, area: ScanArea) => void,
        onDecodeFailure: () => void,
    ) {
        if (state.isDestroyed || state.isVideoActive === false || state.isVideoPaused) {
            return
        }

        state.requestFrame(() => {
            if (
                // Skip if the worker is not ready
                state.isReady === false ||
                // Skip if the time since the last request frame is less than the scan rate
                performance.now() - state.decodeFrameRequestTimestamp < 1000 / state.scanRate ||
                // Skip if the frame is already processed
                state.isDecodeFrameProcessed ||
                // Skip if the video is not ready
                state.video.readyState <= 1
            ) {
                state.decodeFrameRequestTimestamp = performance.now()
                handleDecode(onDecodeSuccess, onDecodeFailure)
                return
            }

            state.isDecodeFrameProcessed = true

            state.scanArea = state.calcScanArea(state.video)
            state.canvas.height = state.scanArea.height
            state.canvas.width = state.scanArea.width
            state.canvasContext.clearRect(0, 0, state.canvas.width, state.canvas.height)
            state.canvasContext.drawImage(
                state.video,
                state.scanArea.x,
                state.scanArea.y,
                state.scanArea.width,
                state.scanArea.height,
                0,
                0,
                state.canvas.width,
                state.canvas.height,
            )

            const imageData = state.canvasContext.getImageData(
                0,
                0,
                state.canvas.width,
                state.canvas.height,
            )

            if (state.debug) {
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

                        onDecodeSuccess(data.rawValue, {
                            height: Math.max(...cornerPointsY) - Math.min(...cornerPointsY),
                            width: Math.max(...cornerPointsX) - Math.min(...cornerPointsX),
                            x: Math.min(...cornerPointsX) + state.scanArea.x,
                            y: Math.min(...cornerPointsY) + state.scanArea.y,
                        })
                    } else {
                        onDecodeFailure()
                    }
                })
                .catch(() => {
                    console.error('Failed to decode barcode')
                })
                .finally(() => {
                    state.isDecodeFrameProcessed = false
                    state.decodeFrameRequestTimestamp = performance.now()
                    handleDecode(onDecodeSuccess, onDecodeFailure)
                })
        })
    }

    async function destroy() {
        if (state.isDestroyed) {
            return
        }

        stop()

        document.removeEventListener('visibilitychange', handleVisibilityChange)

        state.worker?.terminate()
        state.worker = null
        state.isDestroyed = true
        state.isReady = false
    }

    function pause() {
        state.canvas.height = state.video.videoHeight
        state.canvas.width = state.video.videoWidth
        state.canvasContext.clearRect(0, 0, state.canvas.width, state.canvas.height)
        state.canvasContext.drawImage(
            state.video,
            0,
            0,
            state.canvas.width,
            state.canvas.height,
            0,
            0,
            state.canvas.width,
            state.canvas.height,
        )

        state.video.poster = state.canvas.toDataURL()

        if (state.video.srcObject instanceof MediaStream) {
            state.video.srcObject.getTracks().forEach((track) => track.stop())
        }

        state.video.srcObject = null
        state.isVideoPaused = true
    }

    async function start(
        { facingMode = 'environment' }: { facingMode?: 'environment' | 'user' } = {},
        onDecodeSuccess: (data: string, area: ScanArea) => void,
        onDecodeFailure: () => void = () => {},
    ) {
        const hasAccess = await getCameraAccess()

        if (!hasAccess) {
            throw new Error('No camera access')
        }

        if (
            state.video.srcObject instanceof MediaStream &&
            state.isVideoActive &&
            state.isVideoPaused === false
        ) {
            return
        }

        if (state.video.srcObject instanceof MediaStream) {
            await state.video.play()
        } else {
            state.video.srcObject = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode,
                },
            })

            await state.video.play()
        }

        state.facingMode = facingMode
        state.isVideoActive = true
        state.isVideoPaused = false
        state.onDecodeFailure = onDecodeFailure
        state.onDecodeSuccess = onDecodeSuccess
        state.scanArea = state.calcScanArea(state.video)
        state.video.style.transform = facingMode === 'user' ? 'scaleX(-1)' : 'none'

        handleDecode(onDecodeSuccess, onDecodeFailure)
    }

    function stop() {
        if (state.video.srcObject instanceof MediaStream) {
            state.video.srcObject.getTracks().forEach((track) => track.stop())
        }

        state.video.poster = ''
        state.video.srcObject = null
        state.isVideoActive = false
        state.isVideoPaused = false
    }

    return {
        destroy,
        pause,
        start,
        state,
        stop,
        watch,
    }
}

export { createBarcodeScanner }
