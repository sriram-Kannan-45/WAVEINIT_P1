import { useState, useEffect, useCallback } from 'react';
import interviewApi from '../api';

export function useTrainers() {
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTrainers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await interviewApi.listTrainers();
      setTrainers(data.trainers || data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTrainers(); }, [fetchTrainers]);

  return { trainers, loading, error, refetch: fetchTrainers };
}
