import BarcodeScanner from './lib/barcode-scanner'
import './main.css'

const video = document.querySelector<HTMLVideoElement>('[data-id="video"]')

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

if (video) {
    const barcodeScanner = new BarcodeScanner({
        onDecode: (result) => {
            if (!resultTitle || !resultValue) {
                return
            }

            // barcodeScanner.pause()

            resultValue.textContent = result
        },
        onDecodeError: (error) => {
            if (!resultTitle || !resultValue) {
                return
            }

            resultValue.textContent = error
        },
        options: {
            // calcScanArea: (video) => {
            //     console.log(video.videoWidth, video.videoHeight)

            //     return {
            //         height: video.videoHeight,
            //         width: video.videoWidth,
            //         x: 0,
            //         y: 0,
            //     }
            // },
            debug: true,
            scanRate: 24,
        },
        video,
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

        const img = document.querySelector<HTMLImageElement>('[data-id="decode-frame-image"]')
        if (img) {
            img.src = canvas.toDataURL()
        } else {
            const img = document.createElement('img')
            img.dataset.id = 'decode-frame-image'
            img.style.position = 'absolute'
            img.style.top = '0'
            img.style.right = '0'
            img.style.width = `${imageData.width}px`
            img.style.height = `${imageData.height}px`
            img.src = canvas.toDataURL()
            document.body?.appendChild(img)
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
