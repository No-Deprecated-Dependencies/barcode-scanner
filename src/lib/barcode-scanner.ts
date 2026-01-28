import type { DetectedBarcode } from './barcode-detector.type'
import type {
    OnDecode,
    OnDecodeError,
    ScanArea,
    WorkerRequest,
    WorkerResponse,
} from './barcode-scanner.types'

import { convertVideoAreaToElementArea } from './utils'

class BarcodeScanner {
    private calcScanArea: (video: HTMLVideoElement) => ScanArea
    private canvas: HTMLCanvasElement
    private canvasContext: CanvasRenderingContext2D
    private debug?: boolean
    private decodeFrameRequestTimestamp: number
    private decodeTimeout: number
    private isDecodeFrameProcessed: boolean
    private isDestroyed: boolean
    private onDecode: OnDecode
    private onDecodeError?: OnDecodeError
    private onVisibilityChange: () => void
    private requestFrame: (callback: () => void) => number
    private resumeOnVisibilityChange: boolean
    private scanArea: ScanArea
    private scanRate: number
    private video: HTMLVideoElement
    private videoActive: boolean
    private videoPaused: boolean
    private worker: Worker

    constructor({
        onDecode,
        onDecodeError,
        options,
        video,
    }: {
        onDecode: OnDecode
        onDecodeError?: OnDecodeError
        options?: {
            calcScanArea?: (video: HTMLVideoElement) => ScanArea
            debug?: boolean
            decodeTimeout?: number
            scanRate?: number
        }
        video: HTMLVideoElement
    }) {
        if (video && !(video instanceof HTMLVideoElement)) {
            throw new Error('video is not a HTMLVideoElement')
        }

        if (onDecode && !(onDecode instanceof Function)) {
            throw new Error('onDecode is not a function')
        }

        if (onDecodeError && !(onDecodeError instanceof Function)) {
            throw new Error('onDecodeError is not a function')
        }

        this.canvas = document.createElement('canvas')

        const context = this.canvas.getContext('2d', { willReadFrequently: true })

        if (!context) {
            throw new Error('Failed to get canvas context')
        }

        this.calcScanArea = options?.calcScanArea ?? this.getScanArea
        this.canvasContext = context
        this.debug = options?.debug
        this.decodeTimeout = options?.decodeTimeout ?? 1000
        this.isDecodeFrameProcessed = false
        this.isDestroyed = false
        this.onDecode = onDecode
        this.onDecodeError = onDecodeError
        this.requestFrame = video.requestVideoFrameCallback
            ? video.requestVideoFrameCallback.bind(video)
            : requestAnimationFrame
        this.decodeFrameRequestTimestamp = performance.now()
        this.resumeOnVisibilityChange = false
        this.scanArea = this.calcScanArea(video)
        this.scanRate = options?.scanRate ?? 24

        /**
         * Setup video
         */
        this.video = video
        this.video.autoplay = true
        this.video.disablePictureInPicture = true
        this.video.hidden = false
        this.video.muted = true
        this.video.playsInline = true
        this.videoActive = false
        this.videoPaused = false

        this.onVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                if (this.videoActive && this.videoPaused === false) {
                    this.resumeOnVisibilityChange = true
                }

                this.pause()
            } else {
                if (this.resumeOnVisibilityChange) {
                    this.resumeOnVisibilityChange = false

                    this.start()
                }
            }
        }

        document.addEventListener('visibilitychange', this.onVisibilityChange)

        /**
         * Setup worker
         */
        this.worker = new Worker(new URL('./barcode-scanner.worker.ts', import.meta.url), {
            type: 'module',
        })
    }

    public decode(imageData: ImageData): Promise<DetectedBarcode | null> {
        if (!(imageData instanceof ImageData)) {
            throw new Error('Invalid decode data')
        }

        // TODO: Использовать другой метод генерации
        const requestId = `${performance.now()}-${Math.random().toString(36).slice(2)}`

        return new Promise((res, rej) => {
            let timeout: ReturnType<typeof setTimeout> = 0

            const handleWorkerResponse = ({
                data: { data, uuid },
            }: MessageEvent<WorkerResponse>) => {
                if (uuid !== requestId) {
                    return
                }

                clearTimeout(timeout)

                this.worker.removeEventListener('message', handleWorkerResponse)

                res(data)
            }

            /**
             * Timeout for the scan request
             */
            timeout = setTimeout(() => {
                this.worker.removeEventListener('message', handleWorkerResponse)

                rej(null)
            }, this.decodeTimeout)

            this.worker.addEventListener('message', handleWorkerResponse)
            this.worker.postMessage({ data: imageData, uuid: requestId } satisfies WorkerRequest)
        })
    }

    public async destroy(): Promise<void> {
        if (this.isDestroyed) {
            return
        }

        await this.stop()

        document.removeEventListener('visibilitychange', this.onVisibilityChange)

        this.worker.terminate()
        this.isDestroyed = true
    }

    public async getCameraAccess(): Promise<boolean> {
        if (await this.hasCameraAccess()) {
            return true
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true })
            const tracks = stream.getTracks()

            for (const track of tracks) {
                track.stop()
            }

            return true
        } catch {
            return false
        }
    }

    public getScanArea(video: HTMLVideoElement): ScanArea {
        const size = Math.round((2 / 3) * Math.min(video.videoWidth, video.videoHeight))

        return {
            height: size,
            width: size,
            x: Math.round((video.videoWidth - size) / 2),
            y: Math.round((video.videoHeight - size) / 2),
        }
    }

    public async hasCameraAccess(): Promise<boolean> {
        try {
            const status = await navigator.permissions.query({ name: 'camera' })

            return status.state === 'granted'
        } catch {
            const devices = await navigator.mediaDevices.enumerateDevices()
            const cameras = devices.filter(
                (device) => device.deviceId && device.kind === 'videoinput',
            )

            return cameras.length > 0
        }
    }

    public pause(): void {
        this.canvas.height = this.video.videoHeight
        this.canvas.width = this.video.videoWidth
        this.canvasContext.clearRect(0, 0, this.canvas.width, this.canvas.height)
        this.canvasContext.drawImage(
            this.video,
            0,
            0,
            this.canvas.width,
            this.canvas.height,
            0,
            0,
            this.canvas.width,
            this.canvas.height,
        )

        this.video.poster = this.canvas.toDataURL()

        if (this.video.srcObject instanceof MediaStream) {
            this.video.srcObject.getTracks().forEach((track) => track.stop())
        }

        this.video.srcObject = null
        this.videoPaused = true
    }

    public async start({
        facingMode = 'environment',
    }: {
        facingMode?: 'environment' | 'user'
    } = {}): Promise<void> {
        const hasAccess = await this.getCameraAccess()

        if (!hasAccess) {
            throw new Error('No camera access')
        }

        if (
            this.video.srcObject instanceof MediaStream &&
            this.videoActive &&
            this.videoPaused === false
        ) {
            return
        }

        if (this.video.srcObject instanceof MediaStream) {
            await this.video.play()
        } else {
            this.video.srcObject = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode,
                },
            })

            await this.video.play()
        }

        this.video.style.transform = facingMode === 'user' ? 'scaleX(-1)' : 'none'
        this.videoActive = true
        this.videoPaused = false
        this.decodeFrame()
    }

    public async stop(): Promise<void> {
        if (this.video.srcObject instanceof MediaStream) {
            this.video.srcObject.getTracks().forEach((track) => track.stop())
        }

        this.video.poster = ''
        this.video.srcObject = null
        this.videoActive = false
        this.videoPaused = false
    }

    private decodeFrame(): void {
        // prettier-ignore
        if (
            this.isDestroyed ||
            this.videoActive === false ||
            this.videoPaused
        ) {
            return
        }

        this.requestFrame(() => {
            if (
                // Skip if the time since the last request frame is less than the scan rate
                performance.now() - this.decodeFrameRequestTimestamp < 1000 / this.scanRate ||
                // Skip if the frame is already processed
                this.isDecodeFrameProcessed ||
                // Skip if the video is ended
                this.video.ended ||
                // Skip if the video is paused
                this.video.paused ||
                // Skip if the video is not ready
                this.video.readyState <= 1
            ) {
                this.decodeFrameRequestTimestamp = performance.now()
                this.decodeFrame()
                return
            }

            this.isDecodeFrameProcessed = true

            this.scanArea = this.calcScanArea(this.video)
            this.canvas.height = this.scanArea.height
            this.canvas.width = this.scanArea.width
            this.canvasContext.clearRect(0, 0, this.canvas.width, this.canvas.height)
            this.canvasContext.drawImage(
                this.video,
                this.scanArea.x,
                this.scanArea.y,
                this.scanArea.width,
                this.scanArea.height,
                0,
                0,
                this.canvas.width,
                this.canvas.height,
            )

            const imageData = this.canvasContext.getImageData(
                0,
                0,
                this.canvas.width,
                this.canvas.height,
            )

            if (this.debug) {
                window.dispatchEvent(
                    new CustomEvent('barcode-scanner:decode-frame', {
                        detail: {
                            imageData,
                        },
                    }),
                )
            }

            this.decode(imageData)
                .then((data) => {
                    if (data) {
                        const cornerPointsX = data.cornerPoints.map((p) => p.x)
                        const cornerPointsY = data.cornerPoints.map((p) => p.y)

                        this.onDecode(
                            data.rawValue,
                            convertVideoAreaToElementArea(this.video, {
                                height: Math.max(...cornerPointsY) - Math.min(...cornerPointsY),
                                width: Math.max(...cornerPointsX) - Math.min(...cornerPointsX),
                                x: Math.min(...cornerPointsX) + this.scanArea.x,
                                y: Math.min(...cornerPointsY) + this.scanArea.y,
                            }),
                        )
                    } else {
                        this.onDecode(
                            null,
                            convertVideoAreaToElementArea(this.video, this.scanArea),
                        )
                    }
                })
                .catch(() => {
                    this.onDecodeError?.()
                })
                .finally(() => {
                    this.isDecodeFrameProcessed = false
                    this.decodeFrameRequestTimestamp = performance.now()
                    this.decodeFrame()
                })
        })
    }
}

export { BarcodeScanner }
