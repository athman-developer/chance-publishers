try {
  const saved = localStorage.getItem('chance-theme');
  if (saved) document.documentElement.dataset.theme = saved;
} catch {}
