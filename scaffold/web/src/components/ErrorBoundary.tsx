import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorPage } from './ErrorPage';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorPage
          code="500"
          onRetryOrBack={() => {
            this.setState({ hasError: false });
            window.location.reload();
          }}
          onGoToDashboard={() => {
            this.setState({ hasError: false });
            window.location.href = '/';
          }}
        />
      );
    }
    return this.props.children;
  }
}
