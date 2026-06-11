import { Alert, Button, Card, Center, Stack, Text, Title } from '@mantine/core';
import { IconAlertCircle, IconBrandGithub } from '@tabler/icons-react';
import { useSearchParams } from 'react-router';

export function Login() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');

  return (
    <Center h="100vh">
      <Card withBorder shadow="sm" padding="xl" w={400}>
        <Stack>
          <Title order={2}>Coderius Docs Beheer</Title>
          {error === 'geen-org-lid' && (
            <Alert icon={<IconAlertCircle size={16} />} color="red">
              Je GitHub-account is geen lid van de Coderius-Education organisatie.
            </Alert>
          )}
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
