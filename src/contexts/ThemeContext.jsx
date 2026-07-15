import React from 'react';
import { ThemeContext } from './theme-context';

export const ThemeProvider = ({ children }) => {
  const themeValue = {
  };

  return (
    <ThemeContext.Provider value={themeValue}>
      {children}
    </ThemeContext.Provider>
  );
};