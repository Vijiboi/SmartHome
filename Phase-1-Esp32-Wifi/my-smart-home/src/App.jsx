import Dashboard from './components/Dashboard';
import Header from './components/Header';

function App() {
  return (
    <div className="bg-slate-100 min-h-screen text-slate-800">
      <Header />
      <main className="p-4 sm:p-8">
        <Dashboard />
      </main>
    </div>
  );
}

export default App;