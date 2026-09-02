import React from 'react';
import { THEMES } from '../constants/themes';
import type { ThemeConfig } from '../types';
import { Check } from 'lucide-react';

interface ThemeSelectorProps {
  selectedThemeId: string;
  onSelectTheme: (themeId: string) => void;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  selectedThemeId,
  onSelectTheme,
}) => {
  return (
    <div className="theme-grid">
      {THEMES.map((theme: ThemeConfig) => {
        const isSelected = theme.id === selectedThemeId;
        return (
          <div
            key={theme.id}
            onClick={() => onSelectTheme(theme.id)}
            className={`theme-card ${isSelected ? 'selected' : ''}`}
            style={{ background: theme.cssBg, color: theme.cssText }}
          >
            <div className="theme-card-header">
              <span className="theme-name">{theme.name}</span>
              {isSelected && (
                <div className="check-badge">
                  <Check className="w-3.5 h-3.5 text-white" />
                </div>
              )}
            </div>

            <p className="theme-desc">{theme.description}</p>

            <div className="color-palette">
              <span className="color-swatch" style={{ background: `#${theme.bgColor}` }} title="Fundo"></span>
              <span className="color-swatch" style={{ background: `#${theme.cardBgColor}` }} title="Card"></span>
              <span className="color-swatch" style={{ background: `#${theme.primaryColor}` }} title="Primária"></span>
              <span className="color-swatch" style={{ background: `#${theme.secondaryColor}` }} title="Secundária"></span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
