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

// Konten mit einer echten E-Mail-Adresse (nicht die interne
// Benutzername-Domain) gelten als Admin-Zugang.
function isAdminSession(session) {
  const email = session?.user?.email || '';
  return email !== '' && !email.endsWith('@' + USERNAME_LOGIN_DOMAIN);
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
