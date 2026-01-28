import type { ScanArea } from '../barcode-scanner.types'

import { getVideoPosition } from './get-video-position'
import { getVideoScaledSize } from './get-video-scaled-size'

function convertVideoAreaToElementArea(video: HTMLVideoElement, scanArea: ScanArea): ScanArea {
    const isMirrored = /scaleX\(-1\)/.test(video.style.transform)
    const videoHeight = video.videoHeight
    const videoWidth = video.videoWidth
    const videoScaledSize = getVideoScaledSize(video)
    const videoPosition = getVideoPosition(video, videoScaledSize)
    const scanAreaX = isMirrored ? videoWidth - scanArea.x : scanArea.x
    const scanAreaY = scanArea.y

    return {
        height: (scanArea.height / videoHeight) * videoScaledSize.height,
        width: (scanArea.width / videoWidth) * videoScaledSize.width,
        x: (scanAreaX / videoWidth) * videoScaledSize.width + videoPosition.x,
        y: (scanAreaY / videoHeight) * videoScaledSize.height + videoPosition.y,
    }
}

export { convertVideoAreaToElementArea }
