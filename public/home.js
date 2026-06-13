// Homepage. Two doors to the same search:
//   "Google Search"     -> human view (the disguise)
//   "I'm Feeling Agentic" -> agent view (what the model sees)

const form = document.getElementById('searchForm');
const input = document.getElementById('q');
const agentic = document.getElementById('agentic');

form.addEventListener('submit', () => {
  localStorage.setItem('exoogle-view', 'human');
});

agentic.addEventListener('click', () => {
  const q = input.value.trim();
  if (!q) { input.focus(); return; }
  localStorage.setItem('exoogle-view', 'agent');
  window.location.href = 'search.html?q=' + encodeURIComponent(q);
});
