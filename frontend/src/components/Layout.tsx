import {
  ActionIcon,
  AppShell,
  Avatar,
  Burger,
  Group,
  Menu,
  NavLink as MantineNavLink,
  ScrollArea,
  Text,
  Title,
  UnstyledButton,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconChevronDown,
  IconFlask,
  IconFileText,
  IconFolder,
  IconFolderOpen,
  IconHome,
  IconLogout,
  IconMoon,
  IconPackages,
  IconSchool,
  IconSun,
  IconWorldWww,
} from '@tabler/icons-react';
import { Outlet, useLocation, useNavigate } from 'react-router';

import { api } from '../api/client';
import { useMe, useSites, useSubjects } from '../api/hooks';
import { SIDEBAR_CLOSED_KEY, groupSitesBySubject } from '../lib/subjectGroups';
import { useClosedSubjects } from '../lib/useClosedSubjects';

export function Layout() {
  const [opened, { toggle }] = useDisclosure();
  const { data: me } = useMe();
  const { data: sites } = useSites();
  const { data: subjects } = useSubjects();
  const folders = useClosedSubjects(SIDEBAR_CLOSED_KEY);
  const navigate = useNavigate();
  const location = useLocation();
  const canvasRoute =
    location.pathname.endsWith('/edit') &&
    new URLSearchParams(location.search).get('scope') === 'homepage';
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{
        width: 260,
        breakpoint: 'sm',
        collapsed: { mobile: !opened, desktop: canvasRoute && !opened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom={canvasRoute ? undefined : 'sm'}
              aria-label={opened ? 'Navigatie sluiten' : 'Navigatie openen'}
              size="sm"
            />
            <Title order={4} style={{ fontSize: 'clamp(14px, 3vw, 18px)' }}>
              Coderius Docs Beheer
            </Title>
          </Group>
          <Group gap="xs">
            <ActionIcon
              variant="subtle"
              onClick={toggleColorScheme}
              aria-label="Kleurschema wisselen"
            >
              {colorScheme === 'dark' ? (
                <IconSun size={18} />
              ) : (
                <IconMoon size={18} />
              )}
            </ActionIcon>
            {me && (
              <Menu position="bottom-end">
                <Menu.Target>
                  <UnstyledButton>
                    <Group gap="xs">
                      <Avatar src={me.avatar_url} size="sm" radius="xl" />
                      <Text size="sm" visibleFrom="sm">
                        {me.name ?? me.login}
                      </Text>
                      <IconChevronDown size={14} />
                    </Group>
                  </UnstyledButton>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    leftSection={<IconLogout size={14} />}
                    onClick={logout}
                  >
                    Uitloggen
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <ScrollArea>
          <MantineNavLink
            label="Dashboard"
            leftSection={<IconHome size={16} />}
            active={location.pathname === '/'}
            onClick={() => navigate('/')}
          />
          <MantineNavLink
            label="Concepten"
            leftSection={<IconFileText size={16} />}
            active={location.pathname.startsWith('/concepten')}
            onClick={() => navigate('/concepten')}
          />
          <MantineNavLink
            label="Voorbeelden"
            leftSection={<IconPackages size={16} />}
            active={location.pathname.startsWith('/voorbeelden')}
            onClick={() => navigate('/voorbeelden')}
          />
          <MantineNavLink
            label="Klassen"
            leftSection={<IconSchool size={16} />}
            active={location.pathname.startsWith('/klassen')}
            onClick={() => navigate('/klassen')}
          />
          <MantineNavLink
            label="Experimenten"
            leftSection={<IconFlask size={16} />}
            active={location.pathname.startsWith('/experiments')}
            onClick={() => navigate('/experiments')}
          />
          <MantineNavLink
            label="Sites"
            leftSection={<IconWorldWww size={16} />}
            defaultOpened
          >
            {groupSitesBySubject(sites, subjects).map((group) => {
              const open = folders.isOpen(group.key);
              const Icon = open ? IconFolderOpen : IconFolder;
              const isCurrent = (slug: string) =>
                location.pathname.startsWith(`/sites/${slug}`);
              return (
                <MantineNavLink
                  key={group.key}
                  label={group.title}
                  leftSection={<Icon size={16} />}
                  opened={open}
                  onChange={() => folders.toggle(group.key)}
                  role="button"
                  aria-expanded={open}
                  // A closed folder still shows where you are.
                  active={!open && group.sites.some((site) => isCurrent(site.slug))}
                  variant="subtle"
                >
                  {group.sites.map((site) => (
                    <MantineNavLink
                      key={site.slug}
                      label={site.display_name}
                      active={isCurrent(site.slug)}
                      onClick={() => navigate(`/sites/${site.slug}`)}
                    />
                  ))}
                </MantineNavLink>
              );
            })}
          </MantineNavLink>
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
