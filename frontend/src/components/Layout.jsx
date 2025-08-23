import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { FiDatabase, FiCode, FiHardDrive, FiLogOut, FiHome, FiLayers, FiSettings, FiHelpCircle } from 'react-icons/fi';

const Layout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/dashboard', name: 'Dashboard', icon: FiHome },
    { path: '/query-analysis', name: 'Query Analysis', icon: FiCode },
    { path: '/projects', name: 'Project Analysis', icon: FiLayers },
    { path: '/rules', name: 'Rules', icon: FiSettings },
    { path: '/help', name: 'Help', icon: FiHelpCircle },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14">
            <div className="flex items-center">
              <div className="flex items-center space-x-2">
                <FiDatabase className="h-6 w-6 text-primary-600" />
                <span className="text-lg font-semibold text-gray-900">BigQuery Optimization Engine</span>
              </div>
              <div className="hidden md:ml-8 md:flex md:space-x-2">
                {navItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        isActive
                          ? 'text-primary-600 bg-primary-50'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`
                    }
                  >
                    <item.icon className="mr-1.5 h-3.5 w-3.5" />
                    {item.name}
                  </NavLink>
                ))}
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-xs text-gray-600">{user?.name || user?.email}</span>
              <button
                onClick={handleLogout}
                className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                <FiLogOut className="mr-1.5 h-3.5 w-3.5" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
        <Outlet />
      </main>
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <p className="text-center text-xs text-gray-400">
            Developed and maintained by <a href="mailto:jegadesh@google.com" className="text-blue-600 hover:text-blue-700 transition-colors">jegadesh@</a>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;