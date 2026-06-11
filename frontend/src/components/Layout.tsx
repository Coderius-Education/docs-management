import {
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
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconChevronDown,
  IconFlask,
  IconGitPullRequest,
  IconHome,
  IconLogout,
  IconPackages,
  IconWorldWww,
} from '@tabler/icons-react';
import { Outlet, useLocation, useNavigate } from 'react-router';

import { api } from '../api/client';
import { useMe, useSites } from '../api/hooks';

export function Layout() {
  const [opened, { toggle }] = useDisclosure();
  const { data: me } = useMe();
  const { data: sites } = useSites();
  const navigate = useNavigate();
  const location = useLocation();

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Title order={4}>Coderius Docs Beheer</Title>
          </Group>
          {me && (
            <Menu position="bottom-end">
              <Menu.Target>
                <UnstyledButton>
                  <Group gap="xs">
                    <Avatar src={me.avatar_url} size="sm" radius="xl" />
                    <Text size="sm">{me.name ?? me.login}</Text>
                    <IconChevronDown size={14} />
                  </Group>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconLogout size={14} />} onClick={logout}>
                  Uitloggen
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
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
            label="Pull requests"
            leftSection={<IconGitPullRequest size={16} />}
            active={location.pathname.startsWith('/prs')}
            onClick={() => navigate('/prs')}
          />
          <MantineNavLink
            label="Builds & previews"
            leftSection={<IconPackages size={16} />}
            active={location.pathname.startsWith('/builds')}
            onClick={() => navigate('/builds')}
          />
          <MantineNavLink
            label="Experimenten"
            leftSection={<IconFlask size={16} />}
            active={location.pathname.startsWith('/experiments')}
            onClick={() => navigate('/experiments')}
          />
          <MantineNavLink label="Sites" leftSection={<IconWorldWww size={16} />} defaultOpened>
            {sites?.map((site) => (
              <MantineNavLink
                key={site.slug}
                label={site.display_name}
                active={location.pathname.startsWith(`/sites/${site.slug}`)}
                onClick={() => navigate(`/sites/${site.slug}`)}
              />
            ))}
          </MantineNavLink>
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
