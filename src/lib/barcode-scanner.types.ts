import type { DetectedBarcode } from './barcode-detector.type'

export type OnDecode = (data: null | string, area?: ScanArea) => void

export type OnDecodeError = () => void

export type ScanArea = {
    height: number
    width: number
    x: number
    y: number
}
export type WorkerRequest = {
    data: ImageData | null
    uuid: string
}

export type WorkerResponse = {
    data: DetectedBarcode | null
    uuid: string
}
