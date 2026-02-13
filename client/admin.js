(function () {
  const csrfMeta = document.querySelector('meta[name="csrf-token"]');
  if (!csrfMeta) {
    console.warn('CSRF meta tag not found; admin actions may fail.');
  }
  const csrf = csrfMeta?.getAttribute('content') || '';

  function showAdminToast(message, isError) {
    const toast = document.createElement('div');
    toast.textContent = message;
    const bg = isError ? '#dc3545' : '#198754';
    toast.style.cssText =
      `position:fixed;top:1rem;right:1rem;z-index:9999;padding:0.75rem 1.25rem;` +
      `border-radius:6px;color:#fff;font-size:0.9rem;box-shadow:0 2px 8px rgba(0,0,0,0.25);` +
      `transition:opacity 0.4s;opacity:1;background:${bg};`;
    document.body.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity = '0';
      setTimeout(function () {
        toast.remove();
      }, 400);
    }, 3500);
  }

  document
    .querySelectorAll('.game-toggle input[type="checkbox"]')
    .forEach(function (cb) {
      cb.addEventListener('change', function () {
        const userId = this.dataset.userId;
        const gameId = this.dataset.gameId;
        const enabled = this.checked;
        const parsedUserId = parseInt(userId, 10);

        if (!userId || isNaN(parsedUserId)) {
          this.checked = !enabled;
          showAdminToast('Invalid user ID – cannot update game access.', true);
          return;
        }

        fetch('/admin/game-access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
          body: JSON.stringify({
            user_id: parsedUserId,
            game_id: gameId,
            enabled,
          }),
        })
          .then(
            function (r) {
              if (!r.ok) {
                this.checked = !enabled;
                showAdminToast(
                  `Failed to update game access (HTTP ${r.status}). Change reverted.`,
                  true,
                );
              }
            }.bind(this),
          )
          .catch(
            function () {
              this.checked = !enabled;
              showAdminToast(
                'Network error – could not persist game access change. Change reverted.',
                true,
              );
            }.bind(this),
          );
      });
    });
  document.querySelectorAll('.btn-delete-user').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      const userId = this.dataset.userId;
      const username = this.dataset.username;
      if (
        !userId ||
        !confirm(`Delete user "${username}"? This cannot be undone.`)
      )
        return;
      try {
        const r = await fetch('/admin/delete-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrf,
          },
          body: JSON.stringify({ user_id: parseInt(userId, 10) }),
        });
        if (!r.ok) {
          const text = await r.text();
          showAdminToast(`Error ${r.status}: ${text || r.statusText}`, true);
          return;
        }
        let data;
        try {
          data = await r.json();
        } catch (err) {
          console.error('Failed to parse JSON response:', err);
          showAdminToast('Invalid JSON response from server', true);
          return;
        }
        if (data.success) {
          showAdminToast('User deleted', false);
          window.location.reload();
        } else {
          showAdminToast(data.error || 'Failed to delete user', true);
        }
      } catch (err) {
        console.error('Delete-user request failed:', err);
        showAdminToast(`Request failed: ${err.message || err}`, true);
      }
    });
  });
})();
