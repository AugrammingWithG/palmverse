export type CameraErrorKind = 'denied' | 'notfound' | 'inuse' | 'insecure' | 'unsupported' | 'unknown';

export class CameraError extends Error {
  constructor(public kind: CameraErrorKind, message: string) {
    super(message);
  }
}

const FRIENDLY: Record<CameraErrorKind, string> = {
  denied:
    'Camera access was blocked. Click the camera icon in your address bar, allow access, and try again. Or play with the mouse hand instead.',
  notfound: "We couldn't find a camera on this device. You can still try it with the mouse hand.",
  inuse: 'Your camera seems busy in another app (Zoom, OBS, another tab?). Close it and try again.',
  insecure: 'Camera access needs a secure (https) connection. Open the https link, or use localhost.',
  unsupported: "This browser can't share a camera here. Try the latest Chrome, Edge, Safari or Firefox.",
  unknown: 'Something went wrong starting the camera. Try again, or use the mouse hand.',
};

export function friendlyCameraMessage(err: unknown): string {
  return err instanceof CameraError ? FRIENDLY[err.kind] : FRIENDLY.unknown;
}

/** Starts the front camera on the given video element and resolves once frames are flowing. */
export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!window.isSecureContext) throw new CameraError('insecure', 'insecure context');
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('unsupported', 'no getUserMedia');

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 60, max: 60 },
      },
    });
  } catch (e) {
    const name = (e as DOMException)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new CameraError('denied', name);
    if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new CameraError('notfound', name);
    if (name === 'NotReadableError' || name === 'AbortError') throw new CameraError('inuse', name);
    throw new CameraError('unknown', String(e));
  }

  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  if (video.readyState < 2 || video.videoWidth === 0) {
    await new Promise<void>((resolve) => video.addEventListener('loadeddata', () => resolve(), { once: true }));
  }
  return stream;
}

export function stopCamera(video: HTMLVideoElement): void {
  const stream = video.srcObject as MediaStream | null;
  stream?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}
