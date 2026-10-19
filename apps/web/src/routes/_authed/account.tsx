import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useHydrated } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "~/components/ui/button";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { callApi, readError } from "~/lib/api";

const accountQuery = (id: string) =>
  queryOptions({
    queryKey: ["account", id],
    queryFn: () => callApi((api) => api.account.get({ params: { id } })),
  });

export const Route = createFileRoute("/_authed/account")({
  loader: ({ context }) => context.queryClient.ensureQueryData(accountQuery(context.userId)),
  component: AccountPage,
});

function AccountPage() {
  const query = accountQuery(Route.useRouteContext().userId);
  const { data: account } = useSuspenseQuery(query);
  const [displayName, setDisplayName] = useState(account.displayName);
  const hydrated = useHydrated();
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: (displayName: string) =>
      callApi((api) =>
        api.account.updateDisplayName({ params: { id: account.id }, payload: { displayName } }),
      ),
    onSuccess: () => queryClient.invalidateQueries(query),
  });
  const error = update.error ? readError(update.error) : null;
  const nameError = error?.code === "InvalidDisplayName" ? error.message : null;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    update.mutate(displayName);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Account</h1>
      <p className="text-sm text-muted-foreground">{account.email}</p>
      <Field data-invalid={nameError ? true : undefined}>
        <FieldLabel htmlFor="displayName">Display name</FieldLabel>
        <Input
          id="displayName"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          aria-invalid={nameError ? true : undefined}
        />
        <FieldError>{nameError}</FieldError>
      </Field>
      {error && !nameError && <p role="alert">{error.message}</p>}
      <div>
        <Button type="submit" disabled={!hydrated || update.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}
