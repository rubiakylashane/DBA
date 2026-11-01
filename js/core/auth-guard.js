/* Sends visitors to the login page if they are not signed in as the role of this page.
   UI only: the real check must be done by the backend. */

(function () {
  const user = getCurrentUser();
  if (!user || user.role !== document.body.dataset.role) {
    location.replace("../auth/login.html");
  }
})();