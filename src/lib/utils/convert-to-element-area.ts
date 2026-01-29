import type { ScanArea } from '../barcode-scanner.types'

import { getVideoRenderedOffset } from './get-video-rendered-offset'
import { getVideoRenderedSize } from './get-video-rendered-size'

function convertToElementArea(video: HTMLVideoElement, scanArea: ScanArea): ScanArea {
    const isMirrored = /scaleX\(-1\)/.test(video.style.transform)
    const videoHeight = video.videoHeight
    const videoWidth = video.videoWidth
    const videoRenderedSize = getVideoRenderedSize(video)
    const videoRenderedOffset = getVideoRenderedOffset(video, videoRenderedSize)
    const scanAreaX = isMirrored ? videoWidth - scanArea.x : scanArea.x
    const scanAreaY = scanArea.y

    return {
        height: (scanArea.height / videoHeight) * videoRenderedSize.height,
        width: (scanArea.width / videoWidth) * videoRenderedSize.width,
        x: (scanAreaX / videoWidth) * videoRenderedSize.width + videoRenderedOffset.x,
        y: (scanAreaY / videoHeight) * videoRenderedSize.height + videoRenderedOffset.y,
    }
}

export { convertToElementArea }
