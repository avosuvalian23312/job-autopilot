/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Analytics from './pages/Analytics';
import AppHome from './pages/AppHome';
import AppSettings from './pages/AppSettings';
import Applications from './pages/Applications';
import Blog from './pages/Blog';
import Credits from './pages/Credits';
import Landing from './pages/Landing';
import NewJob from './pages/NewJob';
import Packet from './pages/Packet';
import Pricing from './pages/Pricing';
import Results from './pages/Results';
import Resumes from './pages/Resumes';
import Setup from './pages/Setup';


export const PAGES = {
    "Analytics": Analytics,
    "AppHome": AppHome,
    "AppSettings": AppSettings,
    "Applications": Applications,
    "Blog": Blog,
    "Credits": Credits,
    "Landing": Landing,
    "NewJob": NewJob,
    "Packet": Packet,
    "Pricing": Pricing,
    "Results": Results,
    "Resumes": Resumes,
    "Setup": Setup,
}

export const pagesConfig = {
    mainPage: "Landing",
    Pages: PAGES,
};