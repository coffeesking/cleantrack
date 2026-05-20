// ============================================================
// AUTH MODULE
// Simple PIN-based role system
// role: null | 'cleaner' | 'owner'
// ============================================================

const Auth = (() => {
  let currentRole = null;

  function getRole() {
    return currentRole || sessionStorage.getItem('role');
  }

  function setRole(role) {
    currentRole = role;
    sessionStorage.setItem('role', role);
  }

  function clearRole() {
    currentRole = null;
    sessionStorage.removeItem('role');
  }

  function isOwner() {
    return getRole() === 'owner';
  }

  function isCleaner() {
    return getRole() === 'cleaner';
  }

  function isLoggedIn() {
    return getRole() !== null;
  }

  function tryLogin(pin) {
    if (pin === OWNER_PIN) {
      setRole('owner');
      return 'owner';
    }
    if (pin === CLEANER_PIN) {
      setRole('cleaner');
      return 'cleaner';
    }
    return null;
  }

  function logout() {
    clearRole();
  }

  // Restore from session on page load
  function init() {
    const saved = sessionStorage.getItem('role');
    if (saved) currentRole = saved;
  }

  return { getRole, isOwner, isCleaner, isLoggedIn, tryLogin, logout, init };
})();
