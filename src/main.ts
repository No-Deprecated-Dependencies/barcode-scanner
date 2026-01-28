import { BarcodeScanner } from './lib'
import './main.css'

const video = document.querySelector<HTMLVideoElement>('[data-id="video"]')
const videoRenderer = document.querySelector<HTMLVideoElement>('[data-id="video-renderer"]')

/**
 * Get the control elements
 */
const buttonStart = document.querySelector('[data-id="button-start"]')
const buttonPause = document.querySelector('[data-id="button-pause"]')
const buttonStop = document.querySelector('[data-id="button-stop"]')

/**
 * Get the result elements
 */
const resultTitle = document.querySelector('[data-id="result-title"]')
const resultValue = document.querySelector('[data-id="result-value"]')

if (video && videoRenderer) {
    const barcodeScanner = new BarcodeScanner({
        onDecode: (data, area) => {
            if (!resultTitle || !resultValue) {
                return
            }

            const scanAreaPosition = area ?? barcodeScanner.getScanAreaPosition()

            document.documentElement.style.setProperty(
                '--barcode-scanner-area-x',
                `${scanAreaPosition.x}px`,
            )
            document.documentElement.style.setProperty(
                '--barcode-scanner-area-y',
                `${scanAreaPosition.y}px`,
            )
            document.documentElement.style.setProperty(
                '--barcode-scanner-area-width',
                `${scanAreaPosition.width}px`,
            )
            document.documentElement.style.setProperty(
                '--barcode-scanner-area-height',
                `${scanAreaPosition.height}px`,
            )

            if (data) {
                resultValue.textContent = data
            } else {
                resultValue.textContent = 'No data'
            }
        },
        onDecodeError: () => {
            if (!resultTitle || !resultValue) {
                return
            }

            resultValue.textContent = 'Decode error'
        },
        options: {
            calcScanArea(video) {
                const size = Math.round((2 / 3) * Math.min(video.offsetWidth, video.offsetHeight))

                return {
                    height: size,
                    width: size,
                    x: Math.round((video.offsetWidth - size) / 2),
                    y: Math.round((video.offsetHeight - size) / 2),
                }
            },
            debug: true,
            scanRate: 24,
        },
        video: videoRenderer,
    })

    const canvas = document.createElement('canvas')
    const canvasContext = canvas.getContext('2d')

    window.addEventListener('barcode-scanner:decode-frame', (event) => {
        if (!(event instanceof CustomEvent) || !event.detail || !event.detail.imageData) {
            return
        }

        const { imageData } = event.detail as { imageData: ImageData }

        canvas.width = imageData.width
        canvas.height = imageData.height
        canvasContext?.putImageData(imageData, 0, 0)

        const img = document.querySelector<HTMLImageElement>('[data-id="video-preview"]')
        if (img) {
            img.src = canvas.toDataURL()
        } else {
            const img = document.createElement('img')
            img.classList.add('demo__video-preview')
            img.src = canvas.toDataURL()
            img.dataset.id = 'video-preview'
            video.appendChild(img)
        }
    })

    buttonStart?.addEventListener('click', () => {
        barcodeScanner.start()
    })
    buttonPause?.addEventListener('click', () => {
        barcodeScanner.pause()
    })
    buttonStop?.addEventListener('click', () => {
        barcodeScanner.stop()
    })
}
