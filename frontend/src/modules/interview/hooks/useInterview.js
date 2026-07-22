import { useState, useEffect, useCallback } from 'react';
import interviewApi from '../api';

export function useInterview(interviewId) {
  const [interview, setInterview] = useState(null);
  const [loading, setLoading] = useState(!!interviewId);
  const [error, setError] = useState(null);

  const fetchInterview = useCallback(async () => {
    if (!interviewId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await interviewApi.getOne(interviewId);
      setInterview(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [interviewId]);

  useEffect(() => { fetchInterview(); }, [fetchInterview]);

  return { interview, loading, error, refetch: fetchInterview, setInterview };
}

export function useInterviewList(filters = {}) {
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchInterviews = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await interviewApi.list(filters);
      setInterviews(data.interviews || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(filters)]);

  useEffect(() => { fetchInterviews(); }, [fetchInterviews]);

  return { interviews, loading, error, refetch: fetchInterviews, setInterviews };
}

export function useInterviewDashboard() {
  const [stats, setStats] = useState({ total: 0, scheduled: 0, live: 0, completed: 0, cancelled: 0 });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const data = await interviewApi.dashboardStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  return { stats, loading, refetch: fetchStats };
}

export function useMyInterviews() {
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const data = await interviewApi.myInterviews();
      setInterviews(data.interviews || []);
    } catch (err) {
      console.error('Failed to fetch interviews:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return { interviews, loading, refetch: fetch };
}

export function useTrainerInterviews() {
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const data = await interviewApi.trainerInterviews();
      setInterviews(data.interviews || []);
    } catch (err) {
      console.error('Failed to fetch interviews:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return { interviews, loading, refetch: fetch };
}
