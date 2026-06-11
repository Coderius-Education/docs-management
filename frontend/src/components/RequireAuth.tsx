import { Center, Loader } from '@mantine/core';
import { Navigate, Outlet } from 'react-router';

import { useMe } from '../api/hooks';

export function RequireAuth() {
  const { data, isLoading, isError } = useMe();

  if (isLoading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (isError || !data) return <Navigate to="/login" replace />;
  return <Outlet />;
}
