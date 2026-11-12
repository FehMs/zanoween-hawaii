(() => {
  const iframe = document.getElementById('recap-video');
  if (!iframe || !window.Vimeo) return;

  const player = new window.Vimeo.Player(iframe);
  let visible = false;
  // Serialize commands so rapid scrolling cannot leave a hidden video playing.
  let pending = player.ready();
  const syncPlayback = () => {
    pending = pending
      .then(() => visible && !document.hidden ? player.play() : player.pause())
      .catch(() => {
        // Browsers may block autoplay, for example in battery-saving mode.
      });
  };

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting && entry.intersectionRatio > 0;
    syncPlayback();
  }, { threshold: 0 });

  observer.observe(iframe);
  document.addEventListener('visibilitychange', syncPlayback);
})();
