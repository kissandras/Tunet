import { MowerCard } from '../../components';

export function renderMowerCard(mowerId, dragProps, getControls, cardStyle, settingsKey, ctx) {
  const {
    entities,
    editMode,
    cardSettings,
    customNames,
    customIcons,
    getA,
    callService,
    setActiveMowerId,
    setShowMowerModal,
    isMobile,
    t,
  } = ctx;
  return (
    <MowerCard
      key={mowerId}
      mowerId={mowerId}
      dragProps={dragProps}
      controls={getControls(mowerId)}
      cardStyle={cardStyle}
      entities={entities}
      editMode={editMode}
      cardSettings={cardSettings}
      settingsKey={settingsKey}
      customNames={customNames}
      customIcons={customIcons}
      getA={getA}
      callService={callService}
      onOpen={() => {
        if (!editMode && setActiveMowerId && setShowMowerModal) {
          setActiveMowerId(mowerId);
          setShowMowerModal(true);
        }
      }}
      isMobile={isMobile}
      t={t}
    />
  );
}
