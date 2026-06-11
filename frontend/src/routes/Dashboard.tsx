import { Container, Text, Title } from '@mantine/core';

export function Dashboard() {
  return (
    <Container py="xl">
      <Title order={2}>Dashboard</Title>
      <Text c="dimmed">Sites, open PR's en recente builds verschijnen hier (M1).</Text>
    </Container>
  );
}
