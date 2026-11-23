import React from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import App from './App.jsx';import './style.css';
const queryClient=new QueryClient({defaultOptions:{queries:{staleTime:30000,refetchOnWindowFocus:false,retry:1}}});
createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}><App/></QueryClientProvider>);
