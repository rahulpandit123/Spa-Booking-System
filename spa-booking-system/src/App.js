import React, { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import './App.css';

const BookingCalendarPage = React.lazy(() => import('./pages/BookingCalendarPage'));

function App() {
  return (
    <ErrorBoundary
      fallbackRender={({ error }) => (
        <div className="app-error">
          <h2>Something went wrong</h2>
          <pre className="app-error__details">{error?.message}</pre>
        </div>
      )}
      onError={(error) => {
        // eslint-disable-next-line no-console
        console.error(error);
      }}
    >
      <Suspense fallback={<div className="app-loading">Loading...</div>}>
        <BookingCalendarPage />
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
