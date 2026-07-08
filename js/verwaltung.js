document.addEventListener('DOMContentLoaded', async () => {
  const session = await requireSession();
  if (!session) return;
  if (!isAdminSession(session)) {
    window.location.href = 'index.html';
    return;
  }
  wireLogout();
});
