function getVideoRenderedSize(video: HTMLVideoElement) {
    const computedStyle = window.getComputedStyle(video)
    const eAspectRatio = video.offsetWidth / video.offsetHeight
    const vAspectRatio = video.videoWidth / video.videoHeight

    switch (computedStyle.objectFit) {
        case 'contain': {
            return {
                height:
                    vAspectRatio < eAspectRatio
                        ? video.offsetHeight
                        : video.offsetWidth / vAspectRatio,
                width:
                    vAspectRatio < eAspectRatio
                        ? video.offsetHeight * vAspectRatio
                        : video.offsetWidth,
            }
        }
        case 'cover': {
            return {
                height:
                    vAspectRatio > eAspectRatio
                        ? video.offsetHeight
                        : video.offsetWidth / vAspectRatio,
                width:
                    vAspectRatio > eAspectRatio
                        ? video.offsetHeight * vAspectRatio
                        : video.offsetWidth,
            }
        }
        case 'fill': {
            return { height: video.offsetHeight, width: video.offsetWidth }
        }
        case 'none': {
            return { height: video.videoHeight, width: video.videoWidth }
        }
        case 'scale-down': {
            return {
                height: Math.min(
                    vAspectRatio < eAspectRatio
                        ? video.offsetHeight
                        : video.offsetWidth / vAspectRatio,
                    video.videoHeight,
                ),
                width: Math.min(
                    vAspectRatio < eAspectRatio
                        ? video.offsetHeight * vAspectRatio
                        : video.offsetWidth,
                    video.videoWidth,
                ),
            }
        }
        default: {
            return { height: video.videoHeight, width: video.videoWidth }
        }
    }
}

export { getVideoRenderedSize }
