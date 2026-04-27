import { CompareCard } from '../../components';
import { Activity } from '../../icons';
import { getIconComponent } from '../../icons';
import { getSettings, withEditModeGuard } from '../helpers';

export function renderCompareCard(cardId, dragProps, getControls, cardStyle, settingsKey, ctx) {
  const {
    entities,
    editMode,
    conn,
    cardSettings,
    customNames,
    customIcons,
    isMobile,
    setShowSensorInfoModal,
    t,
  } = ctx;
  const settings = getSettings(cardSettings, settingsKey, cardId);
  const entityIds = settings.entityIds || [];
  const name = customNames[cardId] || settings.name;
  const iconName = customIcons[cardId];
  const Icon = iconName ? getIconComponent(iconName) || Activity : Activity;
  const firstEntityId = entityIds[0] || null;

  return (
    <CompareCard
      key={cardId}
      cardId={cardId}
      entityIds={entityIds}
      entities={entities}
      conn={conn}
      settings={settings}
      dragProps={dragProps}
      cardStyle={cardStyle}
      editMode={editMode}
      controls={getControls(cardId)}
      Icon={Icon}
      name={name}
      isMobile={isMobile}
      t={t}
      onOpen={withEditModeGuard(editMode, () => {
        if (firstEntityId) setShowSensorInfoModal(firstEntityId);
      })}
      onOpenEntity={(entityId) => {
        if (!editMode && entityId) setShowSensorInfoModal(entityId);
      }}
    />
  );
}
