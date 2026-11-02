import { useEffect, useRef, useState } from 'react';

// One field-trip camera: live video when the state offers it (HLS stream or an
// embedded player), with the still picture as the backup.
export default function LiveCam({ cam, autoPlay = false }) {
  const live = cam.video ? 'hls' : cam.embed ? 'embed' : null;
  // Cameras without a still picture (Maryland) start their player right away.
  const [playing, setPlaying] = useState(!!live && (autoPlay || !cam.imageUrl));
  const [failed, setFailed] = useState(false);
  const [stillBroken, setStillBroken] = useState(false);

  const showVideo = playing && !failed;
  return (
    <div className="live-cam">
      {showVideo && live === 'hls' && <HlsVideo src={cam.video} title={cam.name} onFail={() => setFailed(true)} />}
      {showVideo && live === 'embed' && (
        <iframe src={cam.embed} title={`Live camera: ${cam.name}`} allow="autoplay; fullscreen" allowFullScreen referrerPolicy="no-referrer" />
      )}
      {!showVideo && cam.imageUrl && !stillBroken && (
        <img src={cam.imageUrl} alt={`Road camera: ${cam.name}`} loading="lazy" onError={() => setStillBroken(true)} />
      )}
      {!showVideo && (!cam.imageUrl || stillBroken) && <div className="cam-empty">📷 This camera is resting right now.</div>}
      {showVideo && <span className="live-tag">● LIVE</span>}
      {live && (!playing || failed) && (
        <button className="play-live" onClick={() => { setFailed(false); setPlaying(true); }} aria-label={`Watch ${cam.name} live`}>▶ Watch live</button>
      )}
      {failed && <p className="cam-note">Live video is taking a nap, so here is a picture instead.</p>}
    </div>
  );
}

function HlsVideo({ src, title, onFail }) {
  const ref = useRef(null);
  useEffect(() => {
    const video = ref.current;
    let hls;
    let gone = false;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src; // Safari and iOS play HLS natively
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (gone) return;
        if (!Hls.isSupported()) return onFail();
        hls = new Hls({ maxBufferLength: 10 });
        hls.on(Hls.Events.ERROR, (_, data) => data.fatal && onFail());
        hls.loadSource(src);
        hls.attachMedia(video);
      }).catch(onFail);
    }
    return () => {
      gone = true;
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps
  return <video ref={ref} muted autoPlay playsInline controls aria-label={`Live camera: ${title}`} onError={onFail} />;
}
