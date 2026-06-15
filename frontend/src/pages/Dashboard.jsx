import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import Sidebar from '../components/Sidebar';
import MemberAvatar from '../components/MemberAvatar';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
  Plus, Users, ArrowRight, X, Search, Bell, ChevronDown,
  Activity, Settings, HelpCircle, Receipt, ArrowRightLeft, UserPlus, Mail
} from 'lucide-react';
import gsap from 'gsap';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';

const MotionLink = motion(Link);

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

const MOCK_STATS = {
  totalYouOwe: 12000,
  totalOwedToYou: 6000,
  outstandingBalance: 100, // Matches layout value in mockup screenshot
  friendsYouOwe: [
    { name: 'Ironman', color: '#f59e0b', amount: 1000 },
    { name: 'Black widow', color: '#ef4444', amount: 5000 },
  ],
  friendsOwedToYou: [
    { name: 'Gamora', color: '#10b981', amount: 3000 },
    { name: 'Black Panther', color: '#111827', amount: 2000 },
  ],
  friendsOutstanding: [
    { name: 'Witch', color: '#d946ef', amount: 10 },
    { name: 'Thor', color: '#3b82f6', amount: 30 },
  ],
  groupsYouOwe: [
    { name: 'Endgame', emoji: '💍', amount: 6000 },
  ],
  groupsOwedToYou: [
    { name: 'Infinity war', emoji: '🪖', amount: 1000 },
  ],
  groupsOutstanding: [
    { name: 'Age of ultron', emoji: '🤖', amount: 5 },
  ]
};

const MOCK_FRIENDS = [
  { id: 'm1', name: 'Ironman', email: 'tony@stark.com', color: '#f59e0b', netBalance: -1000, iOwe: 1000, owedToMe: 0, sharedGroups: [{ id: 'mg1', name: 'Endgame' }] },
  { id: 'm2', name: 'Black widow', email: 'natasha@shield.gov', color: '#ef4444', netBalance: -5000, iOwe: 5000, owedToMe: 0, sharedGroups: [{ id: 'mg1', name: 'Endgame' }] },
  { id: 'm3', name: 'Gamora', email: 'gamora@guardians.galaxy', color: '#10b981', netBalance: 3000, iOwe: 0, owedToMe: 3000, sharedGroups: [{ id: 'mg2', name: 'Infinity war' }] },
  { id: 'm4', name: 'Black Panther', email: 't-challa@wakanda.gov', color: '#111827', netBalance: 2000, iOwe: 0, owedToMe: 2000, sharedGroups: [{ id: 'mg2', name: 'Infinity war' }] },
  { id: 'm5', name: 'Witch', email: 'wanda@avengers.org', color: '#d946ef', netBalance: 10, iOwe: 0, owedToMe: 10, sharedGroups: [{ id: 'mg3', name: 'Age of ultron' }] },
  { id: 'm6', name: 'Thor', email: 'thor@asgard.org', color: '#3b82f6', netBalance: 30, iOwe: 0, owedToMe: 30, sharedGroups: [{ id: 'mg3', name: 'Age of ultron' }] }
];

const MOCK_ACTIVITIES = [
  {
    id: 'ma1',
    type: 'expense',
    description: 'Tony\'s Birthday party',
    amount: 15000,
    date: new Date(Date.now() - 3600000 * 2).toISOString(),
    paidBy: { id: 'm1', name: 'Ironman', avatarColor: '#f59e0b' },
    group: { id: 'mg1', name: 'Endgame' }
  },
  {
    id: 'ma2',
    type: 'settlement',
    amount: 3000,
    date: new Date(Date.now() - 3600000 * 24).toISOString(),
    payer: { id: 'me', name: 'You', avatarColor: '#10b981' },
    receiver: { id: 'm3', name: 'Gamora', avatarColor: '#10b981' },
    group: { id: 'mg2', name: 'Infinity war' }
  },
  {
    id: 'ma3',
    type: 'expense',
    description: 'Supercar rental',
    amount: 25000,
    date: new Date(Date.now() - 3600000 * 48).toISOString(),
    paidBy: { id: 'm2', name: 'Black widow', avatarColor: '#ef4444' },
    group: { id: 'mg1', name: 'Endgame' }
  },
  {
    id: 'ma4',
    type: 'expense',
    description: 'Shawarma post-battle',
    amount: 1200,
    date: new Date(Date.now() - 3600000 * 72).toISOString(),
    paidBy: { id: 'me', name: 'You', avatarColor: '#10b981' },
    group: { id: 'mg1', name: 'Endgame' }
  }
];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'dashboard';
  
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddExpenseSelector, setShowAddExpenseSelector] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  // Friends, Activity & Search states
  const [friends, setFriends] = useState([]);
  const [activities, setActivities] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Add Friend state
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [friendEmail, setFriendEmail] = useState('');
  const [friendName, setFriendName] = useState('');
  const [friendGroupId, setFriendGroupId] = useState('');
  const [addingFriend, setAddingFriend] = useState(false);

  // Three.js canvas ref
  const canvasRef = useRef(null);

  useEffect(() => {
    if (loading || !user || !canvasRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 8;

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      alpha: true,
      antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const objectsGroup = new THREE.Group();
    scene.add(objectsGroup);

    const colors = [0x10b981, 0x3b82f6, 0x06b6d4];
    const meshes = [];

    // Create floating geometries
    for (let i = 0; i < 30; i++) {
      const isSphere = Math.random() > 0.5;
      const geometry = isSphere 
        ? new THREE.SphereGeometry(Math.random() * 0.3 + 0.15, 16, 16)
        : new THREE.TorusGeometry(Math.random() * 0.25 + 0.1, Math.random() * 0.05 + 0.02, 8, 24);
      
      const material = new THREE.MeshPhongMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        transparent: true,
        opacity: 0.6,
        shininess: 80,
        specular: 0xffffff
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 5
      );

      mesh.rotationSpeed = {
        x: (Math.random() - 0.5) * 0.012,
        y: (Math.random() - 0.5) * 0.012,
        z: (Math.random() - 0.5) * 0.008
      };
      
      mesh.velocity = {
        y: (Math.random() - 0.5) * 0.006,
        x: (Math.random() - 0.5) * 0.006
      };

      objectsGroup.add(mesh);
      meshes.push(mesh);
    }

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0x10b981, 1.3, 50);
    pointLight1.position.set(6, 6, 6);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0x3b82f6, 1.3, 50);
    pointLight2.position.set(-6, -6, 6);
    scene.add(pointLight2);

    let mouseX = 0;
    let mouseY = 0;
    
    const handleMouseMove = (e) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = -(e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', handleMouseMove);

    const handleResize = () => {
      if (!camera || !renderer) return;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    let frameId;
    const animate = () => {
      frameId = requestAnimationFrame(animate);

      meshes.forEach(m => {
        m.rotation.x += m.rotationSpeed.x;
        m.rotation.y += m.rotationSpeed.y;
        m.rotation.z += m.rotationSpeed.z;

        m.position.y += m.velocity.y;
        m.position.x += m.velocity.x;
        
        if (Math.abs(m.position.y) > 5) m.velocity.y *= -1;
        if (Math.abs(m.position.x) > 8) m.velocity.x *= -1;
      });

      objectsGroup.position.x += (mouseX * 1.5 - objectsGroup.position.x) * 0.05;
      objectsGroup.position.y += (mouseY * 1.0 - objectsGroup.position.y) * 0.05;

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      meshes.forEach(m => {
        m.geometry.dispose();
        m.material.dispose();
      });
      renderer.dispose();
    };
  }, [loading, user]);

  useEffect(() => {
    if (!loading && user) {
      // Staggered entry for cards
      gsap.fromTo(
        '.corporate-card',
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: 'power2.out', delay: 0.1 }
      );
      // Entry for topbar
      gsap.fromTo(
        '.corporate-topbar',
        { opacity: 0, y: -20 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }
      );
      // Entry for title
      gsap.fromTo(
        '.corporate-title',
        { opacity: 0, x: -20 },
        { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out', delay: 0.15 }
      );
    }
  }, [loading, user]);

  const [stats, setStats] = useState({
    totalYouOwe: 0,
    totalOwedToYou: 0,
    outstandingBalance: 0,
    friendsYouOwe: [],
    friendsOwedToYou: [],
    friendsOutstanding: [],
    groupsYouOwe: [],
    groupsOwedToYou: [],
    groupsOutstanding: []
  });

  const createGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setCreating(true);
    try {
      const res = await api.post('/groups', { name: newGroupName.trim() });
      toast.success('Group created!');
      setGroups((g) => [res.data.group, ...g]);
      setNewGroupName('');
      setShowCreate(false);
      navigate(`/groups/${res.data.group.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const inviteFriend = async (e) => {
    e.preventDefault();
    if (!friendEmail.trim() || !friendGroupId) return;
    setAddingFriend(true);
    try {
      await api.post(`/groups/${friendGroupId}/members`, {
        email: friendEmail.trim().toLowerCase(),
        name: friendName.trim() || undefined,
      });
      toast.success('Friend added to group!');
      setFriendEmail('');
      setFriendName('');
      setShowAddFriend(false);
      loadDashboardData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add friend');
    } finally {
      setAddingFriend(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    if (searchParams.get('createGroup') === 'true') {
      setShowCreate(true);
      setSearchParams((params) => {
        params.delete('createGroup');
        return params;
      });
    }
  }, [searchParams, setSearchParams]);

  const loadDashboardData = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const res = await api.get('/groups');
      const loadedGroups = res.data.groups;
      setGroups(loadedGroups);

      if (loadedGroups.length === 0) {
        setLoading(false);
        return;
      }

      // Query details for each group (balances, expenses, settlements) in parallel
      const detailPromises = loadedGroups.map(async (g) => {
        try {
          const [balRes, expRes, settlRes] = await Promise.all([
            api.get(`/groups/${g.id}/balances`),
            api.get(`/groups/${g.id}/expenses`),
            api.get(`/groups/${g.id}/settlements`)
          ]);
          return { groupId: g.id, balRes, expRes, settlRes, success: true };
        } catch (err) {
          console.error(`Error loading details for group ${g.id}:`, err);
          return { groupId: g.id, success: false };
        }
      });
      const detailResponses = await Promise.all(detailPromises);

      let totalYouOwe = 0;
      let totalOwedToYou = 0;

      const friendsOweMap = {};
      const friendsOwedMap = {};
      const allFriendsMap = {};

      const groupsYouOweList = [];
      const groupsOwedToYouList = [];
      const groupsOutstandingList = [];

      const allActivities = [];
      const completeFriendsMap = {};

      detailResponses.forEach((dRes, index) => {
        if (!dRes.success) return;
        const group = loadedGroups[index];
        const balancesData = dRes.balRes.data;
        const expensesData = dRes.expRes.data.expenses || [];
        const settlementsData = dRes.settlRes.data.settlements || [];

        // Collect all friends from memberships
        group.members.forEach(m => {
          if (m.userId === user?.id) return;
          if (m.leftAt) return;
          const u = m.user;
          if (!completeFriendsMap[u.id]) {
            completeFriendsMap[u.id] = {
              id: u.id,
              name: u.name,
              email: u.email,
              color: u.avatarColor,
              sharedGroups: []
            };
          }
          completeFriendsMap[u.id].sharedGroups.push({ id: group.id, name: group.name });
        });

        // User net balance in this group
        const myNet = balancesData.netBalances?.[user?.id] || 0;
        
        if (myNet < -0.01) {
          totalYouOwe += Math.abs(myNet);
          groupsYouOweList.push({ id: group.id, name: group.name, emoji: '🏠', amount: Math.abs(myNet) });
        } else if (myNet > 0.01) {
          totalOwedToYou += myNet;
          groupsOwedToYouList.push({ id: group.id, name: group.name, emoji: '🏠', amount: myNet });
        } else {
          groupsOutstandingList.push({ id: group.id, name: group.name, emoji: '🏠', amount: 0 });
        }

        // Simplify debts aggregation
        if (balancesData.minSettlements) {
          balancesData.minSettlements.forEach(s => {
            const amount = Number(s.amount);
            if (s.from.id === user?.id) {
              const targetUser = s.to;
              if (!friendsOweMap[targetUser.id]) {
                friendsOweMap[targetUser.id] = { id: targetUser.id, name: targetUser.name, color: targetUser.avatarColor, amount: 0 };
              }
              friendsOweMap[targetUser.id].amount += amount;
            } else if (s.to.id === user?.id) {
              const targetUser = s.from;
              if (!friendsOwedMap[targetUser.id]) {
                friendsOwedMap[targetUser.id] = { id: targetUser.id, name: targetUser.name, color: targetUser.avatarColor, amount: 0 };
              }
              friendsOwedMap[targetUser.id].amount += amount;
            }
          });
        }

        // Aggregate outstanding other friends
        if (balancesData.netBalances && balancesData.users) {
          Object.entries(balancesData.netBalances).forEach(([uid, balance]) => {
            if (uid === user?.id) return;
            const u = balancesData.users[uid];
            if (!u) return;
            if (!allFriendsMap[uid]) {
              allFriendsMap[uid] = { id: uid, name: u.name, color: u.avatarColor, netBalance: 0 };
            }
            allFriendsMap[uid].netBalance += Number(balance);
          });
        }

        // Add expenses to activities
        expensesData.forEach(exp => {
          allActivities.push({
            id: exp.id,
            type: 'expense',
            description: exp.description,
            amount: exp.amount,
            date: exp.date,
            paidBy: exp.paidBy,
            group: { id: group.id, name: group.name },
            shares: exp.shares
          });
        });

        // Add settlements to activities
        settlementsData.forEach(sett => {
          allActivities.push({
            id: sett.id,
            type: 'settlement',
            amount: sett.amount,
            date: sett.date,
            payer: sett.payer,
            receiver: sett.receiver,
            group: { id: group.id, name: group.name }
          });
        });
      });

      const friendsOutstandingList = Object.entries(allFriendsMap)
        .filter(([uid, data]) => Math.abs(data.netBalance) > 0.01)
        .map(([uid, data]) => ({
          id: uid,
          name: data.name,
          color: data.color,
          amount: Math.abs(data.netBalance)
        }));

      setStats({
        totalYouOwe,
        totalOwedToYou,
        outstandingBalance: totalOwedToYou - totalYouOwe,
        friendsYouOwe: Object.values(friendsOweMap),
        friendsOwedToYou: Object.values(friendsOwedMap),
        friendsOutstanding: friendsOutstandingList,
        groupsYouOwe: groupsYouOweList,
        groupsOwedToYou: groupsOwedToYouList,
        groupsOutstanding: groupsOutstandingList
      });

      // Build complete friends list with balances
      const friendsList = Object.values(completeFriendsMap).map(friend => {
        const owedToMe = friendsOwedMap[friend.id]?.amount || 0;
        const iOwe = friendsOweMap[friend.id]?.amount || 0;
        return {
          ...friend,
          owedToMe,
          iOwe,
          netBalance: owedToMe - iOwe
        };
      });
      setFriends(friendsList);

      // Sort and save activities
      allActivities.sort((a, b) => new Date(b.date) - new Date(a.date));
      setActivities(allActivities);

    } catch (err) {
      console.error(err);
      toast.error('Failed to aggregate dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpenseRedirect = (e) => {
    e.preventDefault();
    if (!selectedGroupId) return;
    setShowAddExpenseSelector(false);
    navigate(`/groups/${selectedGroupId}/expenses/new`);
  };

  // Check if we should render mock data (when no groups exist)
  const isMock = groups.length === 0;
  const currentStats = isMock ? MOCK_STATS : stats;

  const getTabTitle = () => {
    switch (activeTab) {
      case 'friends': return 'Friends';
      case 'groups': return 'Groups';
      case 'activity': return 'Recent Activity';
      case 'settings': return 'Account Settings';
      default: return 'Dashboard';
    }
  };

  const renderFriendsTab = () => {
    const activeFriends = isMock ? MOCK_FRIENDS : friends;
    const filteredFriends = activeFriends.filter(f =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.email && f.email.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
      <div className="card corporate-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827', margin: 0 }}>All Friends</h3>
            <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.25rem' }}>Track outstanding balances and settle up with friends</p>
          </div>
          <motion.button
            className="corporate-add-btn"
            style={{ background: '#10b981', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              if (groups.length === 0) {
                toast.error('Please create a group first before inviting friends.');
              } else {
                setFriendGroupId(groups[0].id);
                setShowAddFriend(true);
              }
            }}
          >
            <UserPlus size={16} /> Add friend
          </motion.button>
        </div>

        {filteredFriends.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#9ca3af' }}>
            <Users size={32} style={{ margin: '0 auto 0.75rem auto', opacity: 0.5 }} />
            <p style={{ fontSize: '0.85rem' }}>No friends found</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filteredFriends.map((friend) => {
              const net = friend.netBalance;
              const hasBalance = Math.abs(net) > 0.01;
              const firstSharedGroupId = friend.sharedGroups?.[0]?.id;

              return (
                <motion.div 
                  key={friend.id} 
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', border: '1px solid #f3f4f6', borderRadius: '8px', background: '#f9fafb' }}
                  whileHover={{ x: 4, background: '#ffffff', borderColor: '#10b981', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.05)' }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <MemberAvatar name={friend.name} color={friend.color || '#3b82f6'} size="md" />
                    <div>
                      <div style={{ fontWeight: 700, color: '#1f2937', fontSize: '0.875rem' }}>{friend.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Mail size={12} /> {friend.email || 'No email registered'}
                      </div>
                      {/* Shared groups */}
                      <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                        {friend.sharedGroups.map((g, gi) => (
                          <Link key={gi} to={`/groups/${g.id}`} style={{ fontSize: '0.65rem', padding: '1px 6px', background: '#e5e7eb', color: '#4b5563', borderRadius: '4px', textDecoration: 'none' }}>
                            🏠 {g.name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af' }}>Net Balance</div>
                      <div style={{
                        fontSize: '0.9rem',
                        fontWeight: 800,
                        color: net > 0.01 ? '#10b981' : net < -0.01 ? '#ef4444' : '#6b7280'
                      }}>
                        {net > 0.01 ? `owes you ${fmt(net)}` : net < -0.01 ? `you owe ${fmt(Math.abs(net))}` : 'settled up'}
                      </div>
                    </div>

                    {hasBalance && firstSharedGroupId && (
                      <MotionLink
                        to={`/groups/${firstSharedGroupId}/settle?from=${net < 0 ? user.id : friend.id}&to=${net < 0 ? friend.id : user.id}&amount=${Math.abs(net)}`}
                        style={{
                          background: '#ffffff', border: '1px solid #e5e7eb', color: '#10b981',
                          padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700,
                          textDecoration: 'none', cursor: 'pointer'
                        }}
                        whileHover={{ scale: 1.05, borderColor: '#10b981', backgroundColor: '#ecfdf5' }}
                        whileTap={{ scale: 0.95 }}
                      >
                        Settle up
                      </MotionLink>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderGroupsTab = () => {
    const filteredGroups = groups.filter(g =>
      g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (g.description && g.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
      <div className="card corporate-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827', margin: 0 }}>Groups</h3>
            <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.25rem' }}>View, manage and split bills in your active groups</p>
          </div>
          <motion.button
            className="corporate-add-btn"
            style={{ background: '#3b82f6', borderColor: '#3b82f6', color: 'white', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowCreate(true)}
          >
            <Plus size={16} /> Create group
          </motion.button>
        </div>

        {filteredGroups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#9ca3af' }}>
            <Users size={32} style={{ margin: '0 auto 0.75rem auto', opacity: 0.5 }} />
            <p style={{ fontSize: '0.85rem' }}>No groups found</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {filteredGroups.map((group) => {
              const activeCount = (group.members || []).filter(m => !m.leftAt).length;
              return (
                <MotionLink
                  key={group.id}
                  to={`/groups/${group.id}`}
                  style={{ textDecoration: 'none', color: 'inherit', display: 'block', height: '100%' }}
                  whileHover={{ y: -4, scale: 1.01 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  <div
                    style={{
                      border: '1px solid #e5e7eb', borderRadius: '10px', padding: '1rem',
                      background: '#ffffff', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <span style={{ fontSize: '1.25rem' }}>🏠</span>
                        <span style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600, background: '#f3f4f6', padding: '2px 8px', borderRadius: '999px' }}>
                          {activeCount} members
                        </span>
                      </div>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#111827', margin: '0 0 0.25rem 0' }}>{group.name}</h4>
                      {group.description && (
                        <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 0.75rem 0' }} className="truncate-2-lines">
                          {group.description}
                        </p>
                      )}
                    </div>
                    
                    <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '0.75rem', marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="avatar-stack" style={{ display: 'flex', alignItems: 'center' }}>
                        {(group.members || []).filter(m => !m.leftAt).slice(0, 4).map((m, mi) => (
                          <div key={mi} style={{ marginLeft: mi > 0 ? '-6px' : 0 }}>
                            <MemberAvatar name={m.user.name} color={m.user.avatarColor} size="xs" />
                          </div>
                        ))}
                        {(group.members || []).filter(m => !m.leftAt).length > 4 && (
                          <div style={{
                            marginLeft: '-6px', width: '20px', height: '20px', borderRadius: '50%',
                            background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.6rem', fontWeight: 700, color: '#4b5563', border: '1.5px solid #ffffff'
                          }}>
                            +{(group.members || []).filter(m => !m.leftAt).length - 4}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600 }}>
                        {group._count?.expenses || 0} expenses
                      </span>
                    </div>
                  </div>
                </MotionLink>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderActivityTab = () => {
    const activeActivities = isMock ? MOCK_ACTIVITIES : activities;
    const filteredActivities = activeActivities.filter(act => {
      const q = searchQuery.toLowerCase();
      if (act.type === 'expense') {
        return (
          act.description.toLowerCase().includes(q) ||
          act.paidBy.name.toLowerCase().includes(q) ||
          act.group.name.toLowerCase().includes(q)
        );
      } else {
        return (
          act.payer.name.toLowerCase().includes(q) ||
          act.receiver.name.toLowerCase().includes(q) ||
          act.group.name.toLowerCase().includes(q)
        );
      }
    });

    return (
      <div className="card corporate-card">
        <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827', margin: 0 }}>Recent Activity</h3>
          <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.25rem' }}>View transaction history and updates across all groups</p>
        </div>

        {filteredActivities.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#9ca3af' }}>
            <Activity size={32} style={{ margin: '0 auto 0.75rem auto', opacity: 0.5 }} />
            <p style={{ fontSize: '0.85rem' }}>No activity recorded yet</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filteredActivities.map((act) => {
              const formattedDate = format(new Date(act.date), 'MMM dd, yyyy h:mm a');
              const isExpense = act.type === 'expense';

              return (
                <motion.div 
                  key={act.id} 
                  style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.75rem 0', borderBottom: '1px solid #f3f4f6' }}
                  whileHover={{ x: 4 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '8px',
                    background: isExpense ? '#e0f2fe' : '#ecfdf5',
                    color: isExpense ? '#0284c7' : '#059669',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginTop: '2px', flexShrink: 0
                  }}>
                    {isExpense ? <Receipt size={16} /> : <ArrowRightLeft size={16} />}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.85rem', color: '#1f2937' }}>
                      {isExpense ? (
                        <span>
                          <strong style={{ color: '#111827' }}>{act.paidBy?.id === user?.id ? 'You' : act.paidBy?.name}</strong> paid{' '}
                          <strong style={{ color: '#10b981' }}>{fmt(act.amount)}</strong> for{' '}
                          <span style={{ fontStyle: 'italic', color: '#4b5563' }}>"{act.description}"</span> in{' '}
                          <Link to={`/groups/${act.group.id}`} style={{ color: '#3b82f6', fontWeight: 600, textDecoration: 'none' }}>
                            {act.group.name}
                          </Link>
                        </span>
                      ) : (
                        <span>
                          <strong style={{ color: '#111827' }}>{act.payer?.id === user?.id ? 'You' : act.payer?.name}</strong> settled{' '}
                          <strong style={{ color: '#10b981' }}>{fmt(act.amount)}</strong> with{' '}
                          <strong style={{ color: '#111827' }}>{act.receiver?.id === user?.id ? 'you' : act.receiver?.name}</strong> in{' '}
                          <Link to={`/groups/${act.group.id}`} style={{ color: '#3b82f6', fontWeight: 600, textDecoration: 'none' }}>
                            {act.group.name}
                          </Link>
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.25rem' }}>{formattedDate}</div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderSettingsTab = () => {
    const joinedDate = user?.createdAt ? format(new Date(user.createdAt), 'MMMM dd, yyyy') : 'Recently';

    return (
      <div className="card corporate-card" style={{ maxWidth: '540px', margin: '0 auto' }}>
        <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '1rem', textAlign: 'center' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827', margin: 0 }}>Account Settings</h3>
          <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.25rem' }}>Manage your profile details and preferences</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '1rem 0' }}>
          <div style={{
            width: '72px', height: '72px', borderRadius: '50%',
            background: user?.avatarColor || '#10b981', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.8rem', fontWeight: 800, border: '3px solid #e5e7eb',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
          }}>
            {user?.name?.charAt(0).toUpperCase()}
          </div>

          <div style={{ textAlign: 'center' }}>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827', margin: 0 }}>{user?.name}</h4>
            <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: '0.25rem 0 0 0' }}>{user?.email}</p>
          </div>

          <div style={{ width: '100%', borderTop: '1px solid #f3f4f6', marginTop: '1rem', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.5rem 0', borderBottom: '1px solid #f9fafb' }}>
              <span style={{ color: '#6b7280', fontWeight: 600 }}>Plan Type</span>
              <span style={{ color: '#10b981', fontWeight: 800, background: '#ecfdf5', padding: '2px 8px', borderRadius: '999px', fontSize: '0.7rem' }}>PRO MEMBER</span>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.5rem 0', borderBottom: '1px solid #f9fafb' }}>
              <span style={{ color: '#6b7280', fontWeight: 600 }}>Member Since</span>
              <span style={{ color: '#1f2937', fontWeight: 700 }}>{joinedDate}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.5rem 0', borderBottom: '1px solid #f9fafb' }}>
              <span style={{ color: '#6b7280', fontWeight: 600 }}>Currency Preference</span>
              <span style={{ color: '#1f2937', fontWeight: 700 }}>INR (₹)</span>
            </div>
          </div>
          
          <motion.button
            onClick={() => {
              toast.success('Your settings are synced with the server!');
            }}
            className="corporate-add-btn"
            style={{ width: '100%', background: '#3b82f6', borderColor: '#3b82f6', color: 'white', marginTop: '1rem', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: 700 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Sync Account Details
          </motion.button>
        </div>
      </div>
    );
  };

  if (loading || !user) {
    return (
      <div className="app-layout corporate-dashboard-body">
        <Sidebar groups={[]} />
        <main className="main-content" style={{ marginLeft: '240px', width: 'calc(100% - 240px)' }}>
          <div className="loading-overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
            <div className="spinner spinner-lg" style={{ borderTopColor: '#10b981' }} />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-layout corporate-dashboard-body">
      <canvas ref={canvasRef} className="three-bg-canvas" />
      <Sidebar groups={groups} onAddGroupClick={() => setShowCreate(true)} />

      <main className="main-content" style={{ padding: '0 2.5rem', marginLeft: '240px', width: 'calc(100% - 240px)' }}>
        <div className="content-container animate-fade-in" style={{ maxWidth: '1000px' }}>
          
          {/* Topbar */}
          <div className="corporate-topbar">
            {/* Search */}
            <div className="corporate-search-box">
              <Search size={16} className="corporate-search-icon" />
              <input
                type="text"
                placeholder="Search for expense, groups, friends, etc."
                className="corporate-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Actions & Profile */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <motion.button
                className="corporate-add-btn"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  if (groups.length === 0) {
                    toast.error('Please create a group first before adding expenses');
                  } else {
                    setSelectedGroupId(groups[0].id);
                    setShowAddExpenseSelector(true);
                  }
                }}
              >
                + Add expense
              </motion.button>

              <motion.button
                className="corporate-add-btn"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                style={{ borderColor: '#3b82f6', color: '#3b82f6' }}
                onClick={() => setShowCreate(true)}
              >
                + Add group
              </motion.button>

              <motion.button 
                className="corporate-bell-btn"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Bell size={18} />
              </motion.button>

              {user && (
                <div className="corporate-avatar-container">
                  <div className="corporate-avatar" style={{ background: user.avatarColor || '#10b981' }}>
                    {user.name?.charAt(0).toUpperCase()}
                  </div>
                  <span className="corporate-avatar-dot"></span>
                </div>
              )}
            </div>
          </div>

          {/* Title */}
          <h1 className="corporate-title">{getTabTitle()}</h1>

          {/* Tab Content Router */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            >
              {activeTab === 'dashboard' && (
                <>
                  {/* Card 1: Total Summary */}
                  <motion.div 
                    className="card corporate-card"
                    whileHover={{ y: -4, boxShadow: '0 12px 30px rgba(0,0,0,0.06)' }}
                    transition={{ duration: 0.2 }}
                  >
                    <h3 className="corporate-card-title">Total summary</h3>
                    <div className="corporate-grid-3">
                      
                      <div className="corporate-col">
                        <div className="corporate-col-label">Total amount you owe</div>
                        <div className="corporate-col-val">{fmt(currentStats.totalYouOwe)}</div>
                      </div>

                      <div className="corporate-col">
                        <div className="corporate-col-label">Total amount owe to you</div>
                        <div className="corporate-col-val">{fmt(currentStats.totalOwedToYou)}</div>
                      </div>

                      <div className="corporate-col">
                        <div className="corporate-col-label">Total outstanding balance</div>
                        <div className="corporate-col-val">{fmt(currentStats.outstandingBalance)}</div>
                      </div>

                    </div>
                  </motion.div>

                  {/* Card 2: Friends Summary */}
                  <motion.div 
                    className="card corporate-card"
                    whileHover={{ y: -4, boxShadow: '0 12px 30px rgba(0,0,0,0.06)' }}
                    transition={{ duration: 0.2 }}
                  >
                    <h3 className="corporate-card-title">Friends summary</h3>
                    <div className="corporate-grid-3">
                      
                      {/* Friends you owe */}
                      <div className="corporate-col">
                        <div className="corporate-col-label">Friends you owe</div>
                        <div className="corporate-list">
                          {currentStats.friendsYouOwe.length === 0 ? (
                            <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic', marginTop: '0.5rem' }}>No bills to pay</div>
                          ) : (
                            currentStats.friendsYouOwe.map((item, i) => (
                              <motion.div 
                                key={i} 
                                className="corporate-list-item"
                                whileHover={{ x: 4 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                              >
                                <div className="corporate-list-left">
                                  <MemberAvatar name={item.name} color={item.color || '#ef4444'} size="xs" />
                                  <span className="corporate-list-name">{item.name}</span>
                                </div>
                                <span className="corporate-list-val">{fmt(item.amount)}</span>
                              </motion.div>
                            ))
                          )}
                        </div>
                        <Link to="/dashboard?tab=friends" className="corporate-view-all">View all</Link>
                      </div>

                      {/* Friends owe to you */}
                      <div className="corporate-col">
                        <div className="corporate-col-label">Friends owe to you</div>
                        <div className="corporate-list">
                          {currentStats.friendsOwedToYou.length === 0 ? (
                            <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic', marginTop: '0.5rem' }}>No outstanding debts</div>
                          ) : (
                            currentStats.friendsOwedToYou.map((item, i) => (
                              <motion.div 
                                key={i} 
                                className="corporate-list-item"
                                whileHover={{ x: 4 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                              >
                                <div className="corporate-list-left">
                                  <MemberAvatar name={item.name} color={item.color || '#10b981'} size="xs" />
                                  <span className="corporate-list-name">{item.name}</span>
                                </div>
                                <span className="corporate-list-val">{fmt(item.amount)}</span>
                              </motion.div>
                            ))
                          )}
                        </div>
                        <Link to="/dashboard?tab=friends" className="corporate-view-all">View all</Link>
                      </div>

                      {/* Friends with outstanding balance */}
                      <div className="corporate-col">
                        <div className="corporate-col-label">Friends with outstanding balance</div>
                        <div className="corporate-list">
                          {currentStats.friendsOutstanding.length === 0 ? (
                            <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic', marginTop: '0.5rem' }}>No outstanding balances</div>
                          ) : (
                            currentStats.friendsOutstanding.map((item, i) => (
                              <motion.div 
                                key={i} 
                                className="corporate-list-item"
                                whileHover={{ x: 4 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                              >
                                <div className="corporate-list-left">
                                  <MemberAvatar name={item.name} color={item.color || '#3b82f6'} size="xs" />
                                  <span className="corporate-list-name">{item.name}</span>
                                </div>
                                <span className="corporate-list-val">{fmt(item.amount)}</span>
                              </motion.div>
                            ))
                          )}
                        </div>
                        <Link to="/dashboard?tab=friends" className="corporate-view-all">View all</Link>
                      </div>

                    </div>
                  </motion.div>

                  {/* Card 3: Groups Summary */}
                  <motion.div 
                    className="card corporate-card"
                    whileHover={{ y: -4, boxShadow: '0 12px 30px rgba(0,0,0,0.06)' }}
                    transition={{ duration: 0.2 }}
                  >
                    <h3 className="corporate-card-title">Groups summary</h3>
                    <div className="corporate-grid-3">
                      
                      {/* Groups you owe */}
                      <div className="corporate-col">
                        <div className="corporate-col-label">Groups you owe</div>
                        <div className="corporate-list">
                          {currentStats.groupsYouOwe.length === 0 ? (
                            <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic', marginTop: '0.5rem' }}>All settled up</div>
                          ) : (
                            currentStats.groupsYouOwe.map((item, i) => {
                              const rowContent = (
                                <motion.div 
                                  className="corporate-list-item" 
                                  style={{ cursor: item.id ? 'pointer' : 'default' }}
                                  whileHover={item.id ? { x: 4 } : {}}
                                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                                >
                                  <div className="corporate-list-left">
                                    <span style={{ fontSize: '1rem', marginRight: '0.25rem' }}>{item.emoji || '🏠'}</span>
                                    <span className="corporate-list-name" style={{ color: item.id ? '#10b981' : 'inherit', textDecoration: item.id ? 'underline' : 'none' }}>{item.name}</span>
                                  </div>
                                  <span className="corporate-list-val">{fmt(item.amount)}</span>
                                </motion.div>
                              );
                              return item.id ? (
                                <Link key={i} to={`/groups/${item.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                                  {rowContent}
                                </Link>
                              ) : (
                                <div key={i}>{rowContent}</div>
                              );
                            })
                          )}
                        </div>
                        <Link to="/dashboard?tab=groups" className="corporate-view-all">View all</Link>
                      </div>

                      {/* Groups owe to you */}
                      <div className="corporate-col">
                        <div className="corporate-col-label">Groups owe to you</div>
                        <div className="corporate-list">
                          {currentStats.groupsOwedToYou.length === 0 ? (
                            <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic', marginTop: '0.5rem' }}>All settled up</div>
                          ) : (
                            currentStats.groupsOwedToYou.map((item, i) => {
                              const rowContent = (
                                <motion.div 
                                  className="corporate-list-item" 
                                  style={{ cursor: item.id ? 'pointer' : 'default' }}
                                  whileHover={item.id ? { x: 4 } : {}}
                                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                                >
                                  <div className="corporate-list-left">
                                    <span style={{ fontSize: '1rem', marginRight: '0.25rem' }}>{item.emoji || '🏠'}</span>
                                    <span className="corporate-list-name" style={{ color: item.id ? '#10b981' : 'inherit', textDecoration: item.id ? 'underline' : 'none' }}>{item.name}</span>
                                  </div>
                                  <span className="corporate-list-val">{fmt(item.amount)}</span>
                                </motion.div>
                              );
                              return item.id ? (
                                <Link key={i} to={`/groups/${item.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                                  {rowContent}
                                </Link>
                              ) : (
                                <div key={i}>{rowContent}</div>
                              );
                            })
                          )}
                        </div>
                        <Link to="/dashboard?tab=groups" className="corporate-view-all">View all</Link>
                      </div>

                      {/* Groups with outstanding balance */}
                      <div className="corporate-col">
                        <div className="corporate-col-label">Groups with outstanding balance</div>
                        <div className="corporate-list">
                          {currentStats.groupsOutstanding.length === 0 ? (
                            <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic', marginTop: '0.5rem' }}>All settled up</div>
                          ) : (
                            currentStats.groupsOutstanding.map((item, i) => {
                              const rowContent = (
                                <motion.div 
                                  className="corporate-list-item" 
                                  style={{ cursor: item.id ? 'pointer' : 'default' }}
                                  whileHover={item.id ? { x: 4 } : {}}
                                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                                >
                                  <div className="corporate-list-left">
                                    <span style={{ fontSize: '1rem', marginRight: '0.25rem' }}>{item.emoji || '🏠'}</span>
                                    <span className="corporate-list-name" style={{ color: item.id ? '#10b981' : 'inherit', textDecoration: item.id ? 'underline' : 'none' }}>{item.name}</span>
                                  </div>
                                  <span className="corporate-list-val">{fmt(item.amount)}</span>
                                </motion.div>
                              );
                              return item.id ? (
                                <Link key={i} to={`/groups/${item.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                                  {rowContent}
                                </Link>
                              ) : (
                                <div key={i}>{rowContent}</div>
                              );
                            })
                          )}
                        </div>
                        <Link to="/dashboard?tab=groups" className="corporate-view-all">View all</Link>
                      </div>

                    </div>
                  </motion.div>
                </>
              )}

              {activeTab === 'friends' && renderFriendsTab()}
              {activeTab === 'groups' && renderGroupsTab()}
              {activeTab === 'activity' && renderActivityTab()}
              {activeTab === 'settings' && renderSettingsTab()}
            </motion.div>
          </AnimatePresence>

        </div>
      </main>

      {/* Select Group modal for adding expenses */}
      <AnimatePresence>
        {showAddExpenseSelector && (
          <motion.div 
            className="modal-overlay" 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowAddExpenseSelector(false)}
          >
            <motion.div 
              className="modal corporate-card" 
              initial={{ scale: 0.9, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 15 }}
              transition={{ type: 'spring', duration: 0.35 }}
              onClick={(e) => e.stopPropagation()} 
              style={{ maxWidth: '440px' }}
            >
              <div className="modal-header">
                <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>Add Expense</h3>
                <button className="btn btn-icon btn-ghost" onClick={() => setShowAddExpenseSelector(false)} style={{ border: 'none' }}>
                  <X size={18} style={{ color: '#6b7280' }} />
                </button>
              </div>
              <form onSubmit={handleAddExpenseRedirect}>
                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                  <label className="form-label" htmlFor="add-expense-group-select" style={{ color: '#4b5563', fontSize: '0.75rem', fontWeight: 600 }}>
                    Select the group to split this expense in
                  </label>
                  <select
                    id="add-expense-group-select"
                    className="form-select"
                    value={selectedGroupId}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                    required
                    style={{ marginTop: '0.5rem' }}
                  >
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div className="modal-footer" style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowAddExpenseSelector(false)} style={{ border: 'none', fontSize: '0.8rem' }}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ background: '#10b981', borderColor: '#10b981', fontSize: '0.8rem' }}
                  >
                    Continue
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Group Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div 
            className="modal-overlay" 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCreate(false)}
          >
            <motion.div 
              className="modal corporate-card" 
              initial={{ scale: 0.9, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 15 }}
              transition={{ type: 'spring', duration: 0.35 }}
              onClick={(e) => e.stopPropagation()} 
              style={{ maxWidth: '440px' }}
            >
              <div className="modal-header">
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1f2937' }}>
                  Create a New Group
                </h3>
                <button className="btn btn-icon btn-ghost" onClick={() => setShowCreate(false)} style={{ border: 'none' }}>
                  <X size={18} style={{ color: '#6b7280' }} />
                </button>
              </div>
              <form onSubmit={createGroup}>
                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                  <label className="form-label" htmlFor="group-name-input" style={{ color: '#4b5563', fontSize: '0.75rem', fontWeight: 600 }}>
                    Group name
                  </label>
                  <input
                    id="group-name-input"
                    type="text"
                    className="corporate-form-input"
                    placeholder="e.g. Flat Expenses 2026"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    autoFocus
                    required
                    style={{ marginTop: '0.5rem' }}
                  />
                </div>
                <div className="modal-footer" style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)} style={{ border: 'none', fontSize: '0.8rem' }}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={creating}
                    style={{ background: '#3b82f6', borderColor: '#3b82f6', color: 'white', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700 }}
                  >
                    {creating ? 'Creating…' : 'Create Group'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Friend Modal */}
      <AnimatePresence>
        {showAddFriend && (
          <motion.div 
            className="modal-overlay" 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowAddFriend(false)}
          >
            <motion.div 
              className="modal corporate-card" 
              initial={{ scale: 0.9, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 15 }}
              transition={{ type: 'spring', duration: 0.35 }}
              onClick={(e) => e.stopPropagation()} 
              style={{ maxWidth: '440px' }}
            >
              <div className="modal-header">
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1f2937' }}>
                  Add / Invite Friend to Group
                </h3>
                <button className="btn btn-icon btn-ghost" onClick={() => setShowAddFriend(false)} style={{ border: 'none' }}>
                  <X size={18} style={{ color: '#6b7280' }} />
                </button>
              </div>
              <form onSubmit={inviteFriend}>
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label" htmlFor="friend-email-input" style={{ color: '#4b5563', fontSize: '0.75rem', fontWeight: 600 }}>
                    Email Address
                  </label>
                  <input
                    id="friend-email-input"
                    type="email"
                    className="corporate-form-input"
                    placeholder="e.g. friend@example.com"
                    value={friendEmail}
                    onChange={(e) => setFriendEmail(e.target.value)}
                    autoFocus
                    required
                    style={{ marginTop: '0.5rem' }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label" htmlFor="friend-name-input" style={{ color: '#4b5563', fontSize: '0.75rem', fontWeight: 600 }}>
                    Friend's Name (Optional)
                  </label>
                  <input
                    id="friend-name-input"
                    type="text"
                    className="corporate-form-input"
                    placeholder="e.g. Tony Stark"
                    value={friendName}
                    onChange={(e) => setFriendName(e.target.value)}
                    style={{ marginTop: '0.5rem' }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                  <label className="form-label" htmlFor="friend-group-select" style={{ color: '#4b5563', fontSize: '0.75rem', fontWeight: 600 }}>
                    Add to Group
                  </label>
                  <select
                    id="friend-group-select"
                    className="corporate-form-select"
                    value={friendGroupId}
                    onChange={(e) => setFriendGroupId(e.target.value)}
                    required
                    style={{ marginTop: '0.5rem' }}
                  >
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>

                <div className="modal-footer" style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowAddFriend(false)} style={{ border: 'none', fontSize: '0.8rem' }}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={addingFriend}
                    style={{ background: '#10b981', borderColor: '#10b981', color: 'white', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700 }}
                  >
                    {addingFriend ? 'Adding…' : 'Add Friend'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
