// Normale Nutzer*innen melden sich mit einem Benutzernamen an, nicht mit
// einer E-Mail-Adresse. Supabase Auth kennt aber nur E-Mail-Logins, daher
// wird ein Benutzername intern auf "<benutzername>@USERNAME_LOGIN_DOMAIN"
// abgebildet - diese Konten legt die Admin-Person im Supabase-Dashboard an
// (siehe README.md). Wird stattdessen eine echte E-Mail-Adresse eingegeben
// (enthält "@"), wird sie unverändert für den Login verwendet - das ist
// der separate Zugang der Admin-Person.
const USERNAME_LOGIN_DOMAIN = 'benutzer.mdr-datenbank.local';

function resolveLoginEmail(identifier) {
  return identifier.includes('@') ? identifier : `${identifier}@${USERNAME_LOGIN_DOMAIN}`;
}

// Wer Admin ist, wird bewusst über eine feste Liste entschieden statt über
// ein Muster (z.B. "keine @benutzer.mdr-datenbank.local-Adresse") - sonst
// würde jedes Konto, das aus Versehen mit einer echten statt der
// Benutzername-Adresse angelegt wird, fälschlich Admin-Rechte bekommen.
const ADMIN_EMAILS = ['lisa-jacobi@hotmail.com'];

function isAdminSession(session) {
  const email = session?.user?.email || '';
  return ADMIN_EMAILS.includes(email);
}

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
