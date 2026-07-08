// Sorgt dafür, dass geschützte Seiten (index.html, horse.html) nur mit
// gültiger Supabase-Session erreichbar sind.
async function requireSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

function wireLogout(selector) {
  const btn = document.querySelector(selector || '#logout-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
  });
}
