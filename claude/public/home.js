// Google homepage. The form submits to search.html — Exa answers underneath.
// "I'm Feeling Lucky" submits the same search (the joke is the backend, not the button).

const form = document.getElementById('searchForm');
const input = document.getElementById('q');

form.addEventListener('submit', (e) => {
  if (!input.value.trim()) { e.preventDefault(); input.focus(); }
});
