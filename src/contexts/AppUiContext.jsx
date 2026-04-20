import { createContext, useContext, useMemo, useState } from 'react';

const AppUiContext = createContext(null);

/** @param {{ children: import('react').ReactNode }} props */
export function AppUiProvider({ children }) {
  const [activeVacuumId, setActiveVacuumId] = useState(null);
  const [activeMowerId, setActiveMowerId] = useState(null);
  const [showThemeSidebar, setShowThemeSidebar] = useState(false);
  const [showLayoutSidebar, setShowLayoutSidebar] = useState(false);
  const [editCardSettingsKey, setEditCardSettingsKey] = useState(null);
  const [editMode, setEditMode] = useState(false);

  const value = useMemo(
    () => ({
      activeVacuumId,
      setActiveVacuumId,
      activeMowerId,
      setActiveMowerId,
      showThemeSidebar,
      setShowThemeSidebar,
      showLayoutSidebar,
      setShowLayoutSidebar,
      editCardSettingsKey,
      setEditCardSettingsKey,
      editMode,
      setEditMode,
    }),
    [activeVacuumId, activeMowerId, showThemeSidebar, showLayoutSidebar, editCardSettingsKey, editMode]
  );

  return <AppUiContext.Provider value={value}>{children}</AppUiContext.Provider>;
}

export function useAppUiStateContext() {
  const context = useContext(AppUiContext);
  if (!context) {
    throw new Error('useAppUiStateContext must be used within an AppUiProvider');
  }
  return context;
}
