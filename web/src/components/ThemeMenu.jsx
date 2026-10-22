import { useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPalette } from '@fortawesome/free-solid-svg-icons/faPalette';
import { faCheck } from '@fortawesome/free-solid-svg-icons/faCheck';
import { faXmark } from '@fortawesome/free-solid-svg-icons/faXmark';
import { useLingui } from '@lingui/react/macro';
import { getAvailableThemes, setStoredTheme, themeSignal } from '../utils/themeManager.js';

// Three dots in a theme's own colors: setting data-theme on the swatch scopes DaisyUI's
// color variables to it, whatever theme the page shows. bg-none: while a modal is open,
// DaisyUI paints the page background as a background-image onto every [data-theme] element.
function ThemeSwatch({ theme }) {
  if (theme === 'system') {
    return (
      <span className='border-base-content/15 relative inline-flex h-6 w-9 shrink-0 overflow-hidden rounded-md border'>
        <span data-theme='light' className='bg-base-100 h-full w-1/2 bg-none' />
        <span data-theme='dark' className='bg-base-100 h-full w-1/2 bg-none' />
      </span>
    );
  }
  return (
    <span
      data-theme={theme}
      className='bg-base-100 border-base-content/15 inline-flex h-6 w-9 shrink-0 items-center justify-center gap-0.5 rounded-md border bg-none'
    >
      <span className='bg-primary h-2.5 w-2.5 rounded-full' />
      <span className='bg-accent h-2.5 w-2.5 rounded-full' />
      <span className='bg-base-content h-2.5 w-2.5 rounded-full' />
    </span>
  );
}

// Theme switcher for the navigation sidebar. The choices open in a dialog portaled to
// <body> rather than a dropdown: the sidebar scrolls (and so clips anything popping out of
// it), and iOS Safari doesn't focus a tapped div, which focus-driven dropdowns rely on.
export function ThemeMenu({ collapsed }) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const themes = getAvailableThemes();
  const current = themeSignal.value;
  const currentLabel = themes.find(th => th.value === current)?.label ?? current;

  return (
    <>
      <button
        type='button'
        onClick={() => setOpen(true)}
        className={
          collapsed
            ? 'btn btn-square btn-md text-base-content hover:bg-base-content/10 h-12 min-h-0 w-12 min-w-0 rounded-xl border-none bg-transparent px-0'
            : 'btn btn-md text-base-content hover:bg-base-content/10 h-12 w-full justify-start gap-3 rounded-xl border-none bg-transparent px-2'
        }
        aria-label={t`Theme`}
        aria-haspopup='dialog'
        title={collapsed ? t`Theme` : undefined}
      >
        <FontAwesomeIcon size='md' icon={faPalette} />
        {!collapsed && (
          <>
            <span>{t`Theme`}</span>
            <span className='text-base-content/60 ml-auto truncate text-xs font-normal'>
              {currentLabel}
            </span>
          </>
        )}
      </button>

      {open &&
        createPortal(
          <div
            className='modal modal-open modal-bottom sm:modal-middle z-[10000]'
            role='dialog'
            aria-modal='true'
            aria-label={t`Theme`}
          >
            <div className='modal-box max-w-sm'>
              <div className='mb-2 flex items-center justify-between'>
                <h3 className='text-lg font-semibold'>{t`Theme`}</h3>
                <button
                  type='button'
                  className='btn btn-sm btn-ghost btn-circle'
                  onClick={() => setOpen(false)}
                  aria-label={t`Close`}
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>
              <ul className='menu w-full p-0' role='listbox' aria-label={t`Theme`}>
                {themes.map(theme => (
                  <li key={theme.value} role='option' aria-selected={theme.value === current}>
                    <button
                      type='button'
                      className={`flex items-center gap-3 py-2.5 ${theme.value === current ? 'menu-active' : ''}`}
                      onClick={() => {
                        setStoredTheme(theme.value);
                        setOpen(false);
                      }}
                    >
                      <ThemeSwatch theme={theme.value} />
                      <span className='grow text-left text-base'>{theme.label}</span>
                      {theme.value === current && (
                        <FontAwesomeIcon icon={faCheck} className='text-xs' />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className='modal-backdrop' onClick={() => setOpen(false)} />
          </div>,
          document.body,
        )}
    </>
  );
}
