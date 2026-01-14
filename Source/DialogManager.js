/**
 * Dialog Manager
 * Moves all dialogs to body to escape container stacking contexts
 */

(function() {
  function moveDialogsToBody() {
    const dialogs = ['settings-dialog', 'account-dialog', 'create-account-dialog', 
                     'forgot-password-email-dialog', 'forgot-password-reset-dialog',
                     'note-editor-dialog', 'quiz-results-dialog',
                     'eureka-info-dialog', 'summary-info-dialog', 'flashcard-info-dialog',
                     'quiz-info-dialog', 'notes-info-dialog'];
    dialogs.forEach(id => {
      const dialog = document.getElementById(id);
      if (dialog && dialog.parentElement !== document.body) {
        document.body.appendChild(dialog);
      }
    });
  }

  // Run immediately if DOM is ready, otherwise wait
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', moveDialogsToBody);
  } else {
    moveDialogsToBody();
  }
})();