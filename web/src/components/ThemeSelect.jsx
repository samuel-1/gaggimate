import { useLingui } from '@lingui/react/macro';
import { SettingsFormField } from './SettingsFormField.jsx';
import { getAvailableThemes, setStoredTheme, themeSignal } from '../utils/themeManager.js';

// UI theme, stored per browser/phone; 'System' follows the system light/dark setting.
export function ThemeSelect({ id = 'ui-theme' }) {
  const { t } = useLingui();

  return (
    <SettingsFormField label={t`Theme`} htmlFor={id} noMargin>
      <select
        id={id}
        className='select select-bordered w-full'
        value={themeSignal.value}
        onChange={e => setStoredTheme(e.target.value)}
      >
        {getAvailableThemes().map(theme => (
          <option key={theme.value} value={theme.value}>
            {theme.label}
          </option>
        ))}
      </select>
    </SettingsFormField>
  );
}
