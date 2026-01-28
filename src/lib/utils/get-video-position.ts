function getVideoPosition(video: HTMLVideoElement, scaledSize: { height: number; width: number }) {
    const computedStyle = window.getComputedStyle(video)

    // prettier-ignore
    const [
        positionX,
        positionY,
    ] = computedStyle.objectPosition
        .split(' ')
        .map((part, index) =>
            part.endsWith('%')
                ? ((index === 0
                      ? video.offsetWidth - scaledSize.width
                      : video.offsetHeight - scaledSize.height) *
                      parseFloat(part)) /
                  100
                : parseFloat(part),
        )

    return {
        x: positionX,
        y: positionY,
    }
}

export { getVideoPosition }
