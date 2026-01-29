import type { ScanArea } from '../barcode-scanner.types'

import { getVideoRenderedOffset } from './get-video-rendered-offset'
import { getVideoRenderedSize } from './get-video-rendered-size'

function convertToVideoArea(video: HTMLVideoElement, scanArea: ScanArea): ScanArea {
    const isMirrored = /scaleX\(-1\)/.test(video.style.transform)
    const videoHeight = video.videoHeight
    const videoWidth = video.videoWidth
    const videoRenderedSize = getVideoRenderedSize(video)
    const videoRenderedOffset = getVideoRenderedOffset(video, videoRenderedSize)
    const scaleToVideoX = videoWidth / videoRenderedSize.width
    const scaleToVideoY = videoHeight / videoRenderedSize.height

    const relativeX = scanArea.x - videoRenderedOffset.x
    const scanAreaX = isMirrored ? videoRenderedSize.width - relativeX - scanArea.width : relativeX
    const scanAreaY = scanArea.y - videoRenderedOffset.y

    return {
        height: scanArea.height * scaleToVideoY,
        width: scanArea.width * scaleToVideoX,
        x: scanAreaX * scaleToVideoX,
        y: scanAreaY * scaleToVideoY,
    }
}

export { convertToVideoArea }
