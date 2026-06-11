import { Button, Card, Center, Stack, Text, Title } from '@mantine/core';
import { IconBrandGithub } from '@tabler/icons-react';

export function Login() {
  return (
    <Center h="100vh">
      <Card withBorder shadow="sm" padding="xl" w={400}>
        <Stack>
          <Title order={2}>Coderius Docs Beheer</Title>
          <Text c="dimmed" size="sm">
            Log in met je GitHub-account. Alleen leden van de Coderius-Education organisatie
            krijgen toegang.
          </Text>
          <Button
            component="a"
            href="/api/auth/login"
            leftSection={<IconBrandGithub size={18} />}
            fullWidth
          >
            Inloggen met GitHub
          </Button>
        </Stack>
      </Card>
    </Center>
  );
}
