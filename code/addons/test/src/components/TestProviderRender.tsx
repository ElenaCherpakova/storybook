import React, { type ComponentProps, type FC, useCallback, useRef, useState } from 'react';

import { Button, ListItem } from 'storybook/internal/components';
import {
  TESTING_MODULE_CONFIG_CHANGE,
  type TestProviderConfig,
  type TestProviderState,
} from 'storybook/internal/core-events';
import type { API } from 'storybook/internal/manager-api';
import { styled, useTheme } from 'storybook/internal/theming';

import {
  AccessibilityIcon,
  EditIcon,
  EyeIcon,
  PlayHollowIcon,
  PointerHandIcon,
  ShieldIcon,
  StopAltHollowIcon,
} from '@storybook/icons';

import { isEqual } from 'es-toolkit';
import { debounce } from 'es-toolkit/compat';

import { type Config, type Details } from '../constants';
import { type TestStatus } from '../node/reporter';
import { Description } from './Description';
import { TestStatusIcon } from './TestStatusIcon';
import { Title } from './Title';

const Container = styled.div({
  display: 'flex',
  flexDirection: 'column',
});

const Heading = styled.div({
  display: 'flex',
  justifyContent: 'space-between',
  padding: '8px 2px',
  gap: 12,
});

const Info = styled.div({
  display: 'flex',
  flexDirection: 'column',
  marginLeft: 6,
});

const Actions = styled.div({
  display: 'flex',
  gap: 2,
});

const Extras = styled.div({
  marginBottom: 2,
});

const Checkbox = styled.input({
  margin: 0,
  '&:enabled': {
    cursor: 'pointer',
  },
});

const statusOrder: TestStatus[] = ['failed', 'warning', 'pending', 'passed', 'skipped'];
const statusMap: Record<TestStatus, ComponentProps<typeof TestStatusIcon>['status']> = {
  failed: 'negative',
  warning: 'warning',
  passed: 'positive',
  skipped: 'unknown',
  pending: 'unknown',
};

export const TestProviderRender: FC<{
  api: API;
  state: TestProviderConfig & TestProviderState<Details, Config>;
  entryId?: string;
}> = ({ state, api, entryId }) => {
  const [isEditing, setIsEditing] = useState(false);
  const theme = useTheme();

  const [config, updateConfig] = useConfig(
    api,
    state.id,
    state.config || { a11y: false, coverage: false }
  );

  const storyId = entryId?.includes('--') ? entryId : undefined;
  const results = (state.details?.testResults || [])
    .flatMap((test) => {
      if (!entryId) {
        return test.results;
      }
      return test.results.filter((result) =>
        storyId ? result.storyId === storyId : result.storyId?.startsWith(`${entryId}-`)
      );
    })
    .sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));

  const status = (state.failed ? 'failed' : results[0]?.status) || 'unknown';

  return (
    <Container>
      <Heading>
        <Info>
          <Title id="testing-module-title" state={state} />
          <Description id="testing-module-description" state={state} />
        </Info>

        <Actions>
          <Button
            aria-label={`${isEditing ? 'Close' : 'Open'} settings for ${state.name}`}
            variant="ghost"
            padding="small"
            active={isEditing}
            disabled={state.running && !isEditing}
            onClick={() => setIsEditing(!isEditing)}
          >
            <EditIcon />
          </Button>
          {state.watchable && !entryId && (
            <Button
              aria-label={`${state.watching ? 'Disable' : 'Enable'} watch mode for ${state.name}`}
              variant="ghost"
              padding="small"
              active={state.watching}
              onClick={() => api.setTestProviderWatchMode(state.id, !state.watching)}
              disabled={state.crashed || state.running}
            >
              <EyeIcon />
            </Button>
          )}
          {state.runnable && (
            <>
              {state.running && state.cancellable ? (
                <Button
                  aria-label={`Stop ${state.name}`}
                  variant="ghost"
                  padding="small"
                  onClick={() => api.cancelTestProvider(state.id)}
                  disabled={state.cancelling}
                >
                  <StopAltHollowIcon />
                </Button>
              ) : (
                <Button
                  aria-label={`Start ${state.name}`}
                  variant="ghost"
                  padding="small"
                  onClick={() => api.runTestProvider(state.id, { entryId })}
                  disabled={state.crashed || state.running || isEditing}
                >
                  <PlayHollowIcon />
                </Button>
              )}
            </>
          )}
        </Actions>
      </Heading>

      {isEditing ? (
        <Extras>
          <ListItem
            as="label"
            title="Component tests"
            icon={<PointerHandIcon color={theme.textMutedColor} />}
            right={<Checkbox type="checkbox" checked disabled />}
          />
          <ListItem
            as="label"
            title="Coverage"
            icon={<ShieldIcon color={theme.textMutedColor} />}
            right={
              <Checkbox
                type="checkbox"
                disabled={state.running}
                checked={config.coverage}
                onChange={() => updateConfig({ coverage: !config.coverage })}
              />
            }
          />
          <ListItem
            as="label"
            title="Accessibility"
            icon={<AccessibilityIcon color={theme.textMutedColor} />}
            right={
              <Checkbox
                type="checkbox"
                disabled={state.running}
                checked={config.a11y}
                onChange={() => updateConfig({ a11y: !config.a11y })}
              />
            }
          />
        </Extras>
      ) : (
        <Extras>
          <ListItem
            title="Component tests"
            icon={
              state.crashed ? (
                <TestStatusIcon status="critical" aria-label="status: crashed" />
              ) : status === 'unknown' ? (
                <TestStatusIcon status="unknown" aria-label="status: unknown" />
              ) : (
                <TestStatusIcon status={statusMap[status]} aria-label={`status: ${status}`} />
              )
            }
          />
          <ListItem
            title="Coverage"
            icon={<TestStatusIcon percentage={60} status="warning" aria-label="status: warning" />}
            right={`60%`}
          />
          <ListItem
            title="Accessibility"
            icon={<TestStatusIcon status="negative" aria-label="status: failed" />}
            right={73}
          />
        </Extras>
      )}
    </Container>
  );
};

function useConfig(api: API, providerId: string, initialConfig: Config) {
  const [currentConfig, setConfig] = useState<Config>(initialConfig);
  const lastConfig = useRef(initialConfig);

  const saveConfig = useCallback(
    debounce((config: Config) => {
      if (!isEqual(config, lastConfig.current)) {
        api.updateTestProviderState(providerId, { config });
        api.emit(TESTING_MODULE_CONFIG_CHANGE, { providerId, config });
        lastConfig.current = config;
      }
    }, 500),
    [api, providerId]
  );

  const updateConfig = useCallback(
    (update: Partial<Config>) => {
      setConfig((value) => {
        const updated = { ...value, ...update };
        saveConfig(updated);
        return updated;
      });
    },
    [saveConfig]
  );

  return [currentConfig, updateConfig] as const;
}
