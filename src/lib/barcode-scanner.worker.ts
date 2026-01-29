import jsQR from 'jsqr'

import type { BarcodeDetector, DetectedBarcode } from './barcode-detector.type'
import type { WorkerRequest, WorkerResponse } from './barcode-scanner.types'

let barcodeDetector: BarcodeDetector | null = null

const worker = self as unknown as Worker

/**
 * Decode the data
 * @param data - The data to decode
 * @returns The detected barcode
 */
async function decode(imageData: ImageData): Promise<DetectedBarcode | null> {
    if (!isBarcodeDetectorAvailable(worker)) {
        return decodeFallback(imageData)
    }

    const detector = getBarcodeDetector(worker)
    const barcodes = await detector.detect(imageData)

    return barcodes[0]
}

/**
 * Decode the data using the fallback method
 * @param data - The data to decode
 * @returns The detected barcode
 */
function decodeFallback(imageData: ImageData): DetectedBarcode | null {
    const result = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
    })

    if (!result) {
        return null
    }

    return {
        boundingBox: new DOMRectReadOnly(0, 0, imageData.width, imageData.height),
        cornerPoints: [
            result.location.topLeftCorner,
            result.location.topRightCorner,
            result.location.bottomRightCorner,
            result.location.bottomLeftCorner,
        ],
        format: 'qr_code',
        rawValue: result.data,
    }
}

/**
 * Get the barcode detector
 * @param worker - The worker
 * @returns The barcode detector
 */
function getBarcodeDetector(
    worker: { BarcodeDetector: BarcodeDetector } & Worker,
): BarcodeDetector {
    if (barcodeDetector === null) {
        barcodeDetector = new worker.BarcodeDetector({ formats: ['qr_code'] })
    }

    return barcodeDetector
}

/**
 * Check if the barcode detector is available
 * @param worker - The worker
 * @returns Whether the barcode detector is available
 */
function isBarcodeDetectorAvailable(
    worker: Worker,
): worker is { BarcodeDetector: BarcodeDetector } & Worker {
    return 'BarcodeDetector' in worker
}

/**
 * Listen for messages from the main thread
 * @param event - The event
 */
worker.addEventListener(
    'message',
    async ({ data: { data, uuid } }: MessageEvent<WorkerRequest>) => {
        const response = { data: null, uuid } as WorkerResponse

        try {
            if (data) {
                response.data = await decode(data)
            }
        } catch (error) {
            console.error(error)
        }

        worker.postMessage(response)
    },
)
