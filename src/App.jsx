import { HashRouter as Router, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import Table from './pages/Table';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/table/:roomId" element={<Table />} />
      </Routes>
    </Router>
  );
}

export default App;
