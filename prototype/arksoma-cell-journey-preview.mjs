const VALID_MODES = new Set(['desktop', 'tablet', 'mobile']);

export function applyPreviewMode(root, requestedMode) {
  const mode = VALID_MODES.has(requestedMode) ? requestedMode : 'desktop';
  root.dataset.mode = mode;
  const controlScope = root.parentElement || root.ownerDocument || root;
  controlScope.querySelectorAll('[data-preview-mode]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.previewMode === mode));
  });
  return mode;
}

if (typeof document !== 'undefined') {
  const shell = document.querySelector('.preview-shell');
  document.querySelectorAll('[data-preview-mode]').forEach((button) => {
    button.addEventListener('click', () => applyPreviewMode(shell, button.dataset.previewMode));
  });
}
