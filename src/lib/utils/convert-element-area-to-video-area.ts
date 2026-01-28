import type { ScanArea } from '../barcode-scanner.types'

import { getVideoPosition } from './get-video-position'
import { getVideoScaledSize } from './get-video-scaled-size'

function convertElementAreaToVideoArea(video: HTMLVideoElement, scanArea: ScanArea): ScanArea {
    const isMirrored = /scaleX\(-1\)/.test(video.style.transform)
    const videoHeight = video.videoHeight
    const videoWidth = video.videoWidth
    const videoScaledSize = getVideoScaledSize(video)
    const videoPosition = getVideoPosition(video, videoScaledSize)
    const scaleToVideoX = videoWidth / videoScaledSize.width
    const scaleToVideoY = videoHeight / videoScaledSize.height

    const relativeX = scanArea.x - videoPosition.x
    const scanAreaX = isMirrored ? videoScaledSize.width - relativeX - scanArea.width : relativeX
    const scanAreaY = scanArea.y - videoPosition.y

    return {
        height: scanArea.height * scaleToVideoY,
        width: scanArea.width * scaleToVideoX,
        x: scanAreaX * scaleToVideoX,
        y: scanAreaY * scaleToVideoY,
    }
}

export { convertElementAreaToVideoArea }
