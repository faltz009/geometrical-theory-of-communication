#!/usr/bin/env python3
"""Numerical checks of the manuscript's constructions and stated boundaries.

Run with Python 3 and NumPy. These are reproducible examples, not proofs.
Output is JSON so each result can travel with its formal-box identifiers.
"""
import json
import math
import numpy as np

RNG = np.random.default_rng(20261004)
TOL = 2e-12
RESULTS = []


def record(ids, description, error=None, **details):
    if error is not None:
        assert error < TOL, (ids, description, error)
    RESULTS.append(dict(boxes=ids, check=description, passed=True,
                        max_absolute_error=error, **details))


def conjugate(x):
    y = -x.copy()
    y[0] = x[0]
    return y


def multiply(x, y):
    """Cayley--Dickson convention (a,b)(c,d)=(ac-conj(d)b, da+b conj(c))."""
    if len(x) == 1:
        return x * y
    n = len(x) // 2
    a, b, c, d = x[:n], x[n:], y[:n], y[n:]
    return np.r_[multiply(a, c) - multiply(conjugate(d), b),
                 multiply(d, a) + multiply(b, conjugate(c))]


def unit(n):
    x = RNG.normal(size=n)
    return x / np.linalg.norm(x)


def prefixes(sequence):
    p = np.eye(len(sequence[0]))[0]
    result = [p]
    for x in sequence:
        p = multiply(p, x)
        result.append(p)
    return result


def tree_product(sequence):
    if len(sequence) == 1:
        return sequence[0]
    m = len(sequence) // 2
    return multiply(tree_product(sequence[:m]), tree_product(sequence[m:]))


def hopf(a, b):
    return np.r_[a @ a - b @ b, 2 * multiply(a, conjugate(b))]


def haar(n):
    q, r = np.linalg.qr(RNG.normal(size=(n, n)) + 1j * RNG.normal(size=(n, n)))
    d = np.diag(r)
    return q * (d / np.abs(d))


def main():
    j = np.array([[0., -1.], [1., 0.]])
    angles = RNG.uniform(-40, 40, 200)
    error = max(np.linalg.norm((math.cos(t)*np.eye(2) + math.sin(t)*j).T @
                              (math.cos(t)*np.eye(2) + math.sin(t)*j) - np.eye(2))
                for t in angles)
    record(['F07'], 'Rotation preserves the plane norm', error)
    phases = np.exp(1j * RNG.uniform(-math.pi, math.pi, (200, 3)))
    error = max(abs(np.conj(u*r)*(u*z) - np.conj(r)*z) for u, r, z in phases)
    record(['F09'], 'Common reference rotation cancels', error)

    for n in (1, 2, 4, 8):
        error = max(abs(np.linalg.norm(multiply(unit(n), unit(n))) - 1)
                    for _ in range(60))
        record(['F15'], f'Multiplicative norm in real dimension {n}', error)
        samples = [unit(2*n) for _ in range(60)]
        error = max(abs(np.linalg.norm(hopf(x[:n], x[n:])) - 1) for x in samples)
        record(['F16'], f'Hopf map lands on its unit base for dimension {n}', error)
        if n < 8:
            error = max(np.linalg.norm(
                hopf(np.r_[x[:n], np.zeros(n)], np.r_[x[n:], np.zeros(n)]) -
                np.r_[hopf(x[:n], x[n:]), np.zeros(n)]) for x in samples)
            record(['F16'], f'Inclusion compatibility from dimension {n} to {2*n}', error)

    x, y = np.zeros(16), np.zeros(16)
    x[3] = x[10] = .5
    y[6], y[15] = .5, -.5
    assert np.linalg.norm(hopf(x, conjugate(y))) == 0
    assert abs(x @ x + y @ y - 1) < TOL
    record(['F16'], 'Sedenion zero divisors: a normalized input maps to zero',
           input_squared_norm=float(x @ x + y @ y), output_norm=0.)

    basis = np.eye(4)
    error = 0.
    for a in range(4):
        for b in range(4):
            p = multiply(basis[a], basis[b])
            error = max(error, np.linalg.norm(np.abs(p) - basis[a ^ b]))
    record(['F17'], 'Quaternion basis labels compose by XOR after forgetting the sign', error)
    assert np.array_equal(multiply(basis[1], basis[2]), basis[3])
    assert np.array_equal(multiply(basis[2], basis[1]), -basis[3])

    error, recovery = 0., 0.
    for _ in range(100):
        sequence = [unit(4) for _ in range(13)]
        replacement = unit(4)
        k = int(RNG.integers(13))
        changed = sequence.copy()
        changed[k] = replacement
        p, pp = prefixes(sequence), prefixes(changed)
        error = max(error, abs(np.linalg.norm(p[-1] - pp[-1]) -
                               np.linalg.norm(sequence[k] - replacement)))
        for r in range(13):
            recovery = max(recovery, np.linalg.norm(
                multiply(conjugate(p[r]), p[r+1]) - sequence[r]))
        assert all(np.linalg.norm(p[r] - pp[r]) < TOL for r in range(k+1))
        assert all(np.linalg.norm(p[r] - pp[r]) > TOL for r in range(k+1, 14))
    record(['F19'], 'Single substitution preserves size and gives the prefix-search predicate', error)
    record(['F19'], 'Stored prefixes recover each individual factor', recovery)
    p, pp = prefixes([-basis[0], -basis[0]]), prefixes([basis[0], basis[0]])
    assert not np.array_equal(p[1], pp[1]) and np.array_equal(p[2], pp[2])
    record(['F19', 'F21'], 'Two changed factors can separate and rejoin: final equality hides edits')

    error, scalar = 0., 0.
    for _ in range(100):
        left, right, a, m, g = [unit(4) for _ in range(5)]
        moved = multiply(a, m) - multiply(m, a)
        error = max(error, np.linalg.norm(moved - np.r_[0., 2*np.cross(a[1:], m[1:])]))
        scalar = max(scalar, abs(moved[0]))
        assert (g - basis[0])[0] < 0
        diff = multiply(multiply(left, g), right) - multiply(left, right)
        recovered = multiply(multiply(conjugate(left), diff), conjugate(right))
        error = max(error, np.linalg.norm(recovered - (g - basis[0])))
    record(['F20'], 'Aligned insertion and elementary move have the stated scalar/vector parts',
           error, moved_scalar_error=scalar)
    assert np.array_equal(multiply(basis[1], -basis[1]), multiply(-basis[1], basis[1]))
    record(['F20'], 'Distinct commuting factors can move invisibly to their product')

    for n in (2, 3, 8):
        error = 0.
        for _ in range(35):
            left, right, a, m, g, gp = [haar(n) for _ in range(6)]
            for order in (2, 'fro'):
                error = max(error, abs(np.linalg.norm(left @ (g-gp) @ right, order) -
                                       np.linalg.norm(g-gp, order)))
            error = max(error, abs(np.trace(a @ m - m @ a)))
            assert np.trace(g - np.eye(n)).real < 0
            error = max(error, abs(np.linalg.norm(g-np.eye(n), 'fro')**2 -
                                   (2*n - 2*np.trace(g).real)))
        record(['F21'], f'Unitary transport and aligned trace discriminator in U({n})', error)
    error = 0.
    for _ in range(45):
        sequence = [unit(8) for _ in range(7)]
        changed = sequence.copy()
        k = int(RNG.integers(7))
        changed[k] = unit(8)
        error = max(error, abs(np.linalg.norm(tree_product(sequence)-tree_product(changed)) -
                               np.linalg.norm(sequence[k]-changed[k])))
    record(['F21'], 'Fixed-tree octonionic single-leaf propagation', error)

    transports, frames = [haar(3) for _ in range(4)], [haar(3) for _ in range(4)]
    w, transformed = np.eye(3, dtype=complex), np.eye(3, dtype=complex)
    for k, u in enumerate(transports):
        w = w @ u
        transformed = transformed @ (frames[k] @ u @ frames[(k+1) % 4].conj().T)
    error = np.linalg.norm(transformed - frames[0] @ w @ frames[0].conj().T)
    record(['F22'], 'Intermediate frames cancel and loop transport is conjugated', error)

    for m in (2, 4, 7, 360):
        grid = np.arange(m) * (2*math.pi/m)
        trials = np.r_[RNG.uniform(0, 2*math.pi, 300), math.pi/m]
        errors = np.min(np.abs(np.angle(np.exp(1j*(trials[:, None]-grid)))), axis=1)
        record(['F23'], f'Equal angular code with {m} representatives attains pi/m',
               abs(float(max(errors)) - math.pi/m))
    for gain in (.1, .5, 1.):
        errors = RNG.uniform(-math.pi+.001, math.pi-.001, 200)
        after = np.angle(np.exp(1j*(errors-gain*errors)))
        record(['F25'], f'Calibrated circular feedback contracts at gain {gain}',
               float(max(abs(after - (1-gain)*errors))))

    print(json.dumps(dict(seed=20261004, tolerance=TOL, numpy_version=np.__version__,
                         checks=RESULTS, count=len(RESULTS), all_passed=True,
                         scope='Finite numerical examples; mathematical proofs and assumptions are in main.tex.'),
                     indent=2))


if __name__ == '__main__':
    main()
