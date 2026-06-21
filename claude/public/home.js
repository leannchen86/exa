// Homepage. Both doors lead to the same agent search — "what the model sees":
//   "Search"              -> the form submits to search.html
//   "I'm Feeling Agentic" -> same destination, the on-brand way in

const input = document.getElementById('q');
const agentic = document.getElementById('agentic');

agentic.addEventListener('click', () => {
  const q = input.value.trim();
  if (!q) { input.focus(); return; }
  window.location.href = 'search.html?q=' + encodeURIComponent(q);
});
